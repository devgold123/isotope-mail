import {URLS} from './url';
import {
  backendRequest as applicationBackendRequest,
  backendRequestCompleted as applicationBackendRequestCompleted, createFolder,
  renameFolder as renameFolderAction, renameFolderOk
} from '../actions/application';
import {unicodeUrlAtob as atob, unicodeUrlBtoa as btoa} from './base64';
import {backendRequest, setFolders, updateFolder} from '../actions/folders';
import {deleteMessageCache, renameMessageCache} from './indexed-db';
import {abortControllerWrappers, abortFetch, credentialsHeaders, toJson} from './fetch';
import {notifyNewMail} from './notification';
import {renameCache} from '../actions/messages';

export const FolderTypes = Object.freeze({
  INBOX: {serverName: 'INBOX', icon: 'inbox', position: 0},
  DRAFTS: {attribute: '\\Drafts', icon: 'drafts', position: 1},
  SENT: {attribute: '\\Sent', icon: 'send', position: 2},
  TRASH: {attribute: '\\Trash', icon: 'delete', position: 3},
  FOLDER: {icon: 'folder'}
});


/**
 * Finds the trash folder from within the current folder state's exploded items.
 *
 * TODO: Create cached selector within REDUX state
 * @param foldersState
 * @returns {any}
 */
export const findTrashFolder = foldersState =>
  Object.values(foldersState.explodedItems).find(f => f.type === FolderTypes.TRASH);

/**
 * Returns the id of the provided folder and all its children.
 *
 * @param {object} folder
 * @returns {Array.<string>}
 */
export function gatherFolderIds(folder) {
  const gatheredIds = [];
  const gatherFolderIdsInner = folderInner => {
    gatheredIds.push(folderInner.folderId);
    if (Array.isArray(folderInner.children)) {
      folderInner.children.forEach(gatherFolderIdsInner);
    }
    return gatheredIds;
  };
  return gatherFolderIdsInner(folder);
}

/**
 * Renames message cache for a folder and all its children in Redux store and IndexedDB.
 *
 * This step is necessary as the "key" for the folder's message cache is the folder Id which is
 * a base64 encoded string of the folder URL (which includes the name).
 *
 * @param dispatch
 * @param user
 * @param renamedParentFolder
 * @private
 */
function _renameMessageCache(dispatch, user, renamedParentFolder) {
  if (!renamedParentFolder || !renamedParentFolder.previousFolderId) {
    return;
  }
  const decodedPreviousFolderId = atob(renamedParentFolder.previousFolderId);
  const decodedNewFolderId = atob(renamedParentFolder.folderId);
  // Rename all child folders
  gatherFolderIds(renamedParentFolder)
    .forEach(childFolderId => {
      const decodedChildFolderId = atob(childFolderId);
      const decodedPreviousChildFolderId = decodedChildFolderId.replace(decodedNewFolderId, decodedPreviousFolderId);
      const previousChildFolderId = btoa(decodedPreviousChildFolderId);
      // Rename cache in Redux store
      dispatch(renameCache(previousChildFolderId, childFolderId));
      // Rename cache in IndexedDB database
      renameMessageCache(user.id, user.hash, previousChildFolderId, childFolderId);
    });
}

/**
 * Processes an initial folder list and adds the corresponding {@link FolderTypes}
 *
 * @param initialFolders {Array}
 * @returns {Array}
 */
export function processFolders(initialFolders) {
  if (!initialFolders) {
    return null;
  }
  const folders = [];
  const specialFolders = [];
  initialFolders.map(folder => {
    if (folder.name && folder.name.toUpperCase() === FolderTypes.INBOX.serverName) {
      folder.type = FolderTypes.INBOX;
      specialFolders[folder.type.position] = folder;
    } else {
      folder.type = FolderTypes.FOLDER;
      // Identify special folder
      let special = false;
      for (const t of [FolderTypes.DRAFTS, FolderTypes.SENT, FolderTypes.TRASH]) {
        if (folder.attributes && folder.attributes.includes(t.attribute)) {
          folder.type = t;
          specialFolders[folder.type.position] = folder;
          special = true;
          break;
        }
      }
      // If regular folder just add to the folder array
      if (!special) {
        folders.push(folder);
      }
    }
    folder.children = processFolders(folder.children);
  });
  // Insert special folders in specific positions
  specialFolders.reverse().forEach(f => folders.unshift(f));
  return folders;
}

/**
 * Builds an object containing all of the folders and their children at the same level
 */
export function explodeFolders(originalFolders, explodedFolders = {}) {
  originalFolders.forEach(f => {
    explodedFolders[f.folderId] = f;
    if (f.children && f.children.length > 0) {
      explodeFolders(f.children, explodedFolders);
    }
  });
  return explodedFolders;
}

/**
 * Returns the setFolders action with the preprocessed folders in the payload.
 *
 * @param dispatch
 * @param credentials
 * @param loadChildren
 * @returns {Promise<*>}
 */
export async function getFolders(dispatch, credentials, loadChildren) {
  abortFetch(abortControllerWrappers.getFoldersAbortController);
  abortControllerWrappers.getFoldersAbortController = new AbortController();
  const signal = abortControllerWrappers.getFoldersAbortController.signal;

  const url = new URL(URLS.FOLDERS, window.location.origin);
  if (loadChildren) {
    url.search = new URLSearchParams({loadChildren: true}).toString();
  }
  dispatch(backendRequest());
  const response = await fetch(url, {
    method: 'GET',
    headers: credentialsHeaders(credentials),
    signal: signal
  });
  const folders = await toJson(response);
  const foldersAction = setFolders(folders);
  const inbox = Object.values(foldersAction.payload).find(f => f.type === FolderTypes.INBOX);
  if (inbox && inbox.newMessageCount > 0) {
    notifyNewMail();
  }
  return dispatch(foldersAction);
}

export function renameFolder(dispatch, user, folderToRename, newName) {
  abortFetch(abortControllerWrappers.getFoldersAbortController);
  dispatch(applicationBackendRequest());
  fetch(folderToRename._links.rename.href, {
    method: 'PUT',
    headers: credentialsHeaders(user.credentials, {'Content-Type': 'application/json'}),
    body: newName
  })
    .then(toJson)
    .then(renamedFolderParent => {
      if (renamedFolderParent.fullName.length === 0) {
        // Root folder (replace current folder tree)
        dispatch(setFolders(renamedFolderParent.children));
      } else {
        dispatch(updateFolder(renamedFolderParent));
      }
      renamedFolderParent.children
        .filter(f => f.previousFolderId)
        .forEach(f => {
          _renameMessageCache(dispatch, user, f);
          dispatch(renameFolderOk(f.previousFolderId, f.folderId));
        });
      dispatch(renameFolderAction(null));
      dispatch(applicationBackendRequestCompleted());
    })
    .catch(() => {
      dispatch(applicationBackendRequestCompleted());
    });
}

/**
 * Triggers BE API to move the provided folderToMove as a child of the specified targetFolder.
 *
 * REDUX store will only be updated once an OK response is received from te server.
 *
 * @param dispatch
 * @param user
 * @param folderToMove
 * @param targetFolder
 */
export function moveFolder(dispatch, user, folderToMove, targetFolder) {
  abortFetch(abortControllerWrappers.getFoldersAbortController);
  dispatch(applicationBackendRequest());
  const targetFolderId = targetFolder ? targetFolder.folderId : null;
  fetch(folderToMove._links.move.href, {
    method: 'PUT',
    headers: credentialsHeaders(user.credentials, {'Content-Type': 'application/json'}),
    body: targetFolderId
  })
    .then(toJson)
    .then(updatedTargetFolder => {
      if (targetFolder) {
        dispatch(updateFolder(updatedTargetFolder));
      } else {
        dispatch(setFolders(updatedTargetFolder.children));
      }
      updatedTargetFolder.children
        .filter(f => f.previousFolderId)
        .forEach(f => {
          _renameMessageCache(dispatch, user, f);
          dispatch(renameFolderOk(f.previousFolderId, f.folderId));
        });
      dispatch(applicationBackendRequestCompleted());
    })
    .catch(() => {
      dispatch(applicationBackendRequestCompleted());
    });
}

/**
 * Triggers BE API to premanently delete the provided folderToDelete and its children.
 *
 * REDUX store will only be updated once an OK response is received from te server.
 *
 * @param dispatch
 * @param user
 * @param folderToDelete
 */
export function deleteFolder(dispatch, user, folderToDelete) {
  abortFetch(abortControllerWrappers.getFoldersAbortController);
  dispatch(applicationBackendRequest());
  fetch(folderToDelete._links.delete.href, {
    method: 'DELETE',
    headers: credentialsHeaders(user.credentials)
  })
    .then(toJson)
    .then(updatedParentFolder => {
      dispatch(updateFolder(updatedParentFolder));
      const folderIds = gatherFolderIds(folderToDelete);
      deleteMessageCache(user.id, user.hash, folderIds);
      dispatch(applicationBackendRequestCompleted());
    })
    .catch(() => {
      dispatch(applicationBackendRequestCompleted());
    });
}

/**
 *
 * @param dispatch
 * @param user
 * @param newFolderName
 * @param parentFolder
 */
export function createRootFolder(dispatch, user, newFolderName) {
  abortFetch(abortControllerWrappers.getFoldersAbortController);
  dispatch(applicationBackendRequest());
  fetch(URLS.FOLDERS, {
    method: 'POST',
    headers: credentialsHeaders(user.credentials),
    body: newFolderName
  })
    .then(toJson)
    .then(folders => {
      dispatch(setFolders(folders));
      dispatch(createFolder(null));
      dispatch(applicationBackendRequestCompleted());
    })
    .catch(() => {
      dispatch(applicationBackendRequestCompleted());
    });
}
