import * as folderService from '../folder';
import * as indexedDbService from '../indexed-db';
import {FolderTypes} from '../folder';
import {ActionTypes} from '../../actions/action-types';
import * as fetch from '../fetch';

describe('Folder service test suite', () => {
  describe('findTrashFolder', () => {
    test('findTrashFolder, state with TRASH folder, should return trash folder', () => {
      // Given
      const folderState = {explodedItems: [
        {type: FolderTypes.INBOX, folderId: 'inbox'},
        {type: FolderTypes.TRASH, folderId: '1337'}
      ]};

      // When
      const trashFolder = folderService.findTrashFolder(folderState);

      // Then
      expect(trashFolder.folderId).toEqual('1337');
    });
    test('findTrashFolder, state withNO TRASH folder, should return trash folder', () => {
      // Given
      const folderState = {explodedItems: [
        {type: FolderTypes.INBOX, folderId: 'inbox'},
        {type: FolderTypes.FOLDER, folderId: '1337'}
      ]};

      // When
      const trashFolder = folderService.findTrashFolder(folderState);

      // Then
      expect(trashFolder).toBeUndefined();
    });
  });
  describe('moveFolder', () => {
    test('moveFolder, valid folders, OK response, should return target folder with children and update state', done => {
      // Given
      const targetFolder = {folderId: 'dGFyZ2V0'/* btoa('target') */};
      fetch.abortFetch = jest.fn();
      indexedDbService.renameMessageCache = jest.fn();
      global.fetch = jest.fn((url, options) => {
        expect(options.body).toMatch('dGFyZ2V0');
        return Promise.resolve({ok: true, url, options,
          json: () => ({...targetFolder, fromBackend: true,
            children: [{folderId: 'dGFyZ2V0LjEzMzc='/* btoa('target.1337') */,
              previousFolderId: 'MTMzNw=='/* btoa('1337') */}]})});
      });
      let dispatchCount = 0;
      const dispatch = jest.fn(action => {
        switch (action.type) {
          case ActionTypes.APPLICATION_BE_REQUEST:
          case ActionTypes.APPLICATION_FOLDER_RENAME_OK:
            dispatchCount++;
            break;
          case ActionTypes.FOLDERS_UPDATE:
            dispatchCount++;
            expect(action.payload.fromBackend).toEqual(true);
            break;
          case ActionTypes.APPLICATION_BE_REQUEST_COMPLETED:
            expect(dispatchCount).toEqual(3);
            expect(indexedDbService.renameMessageCache).toHaveBeenCalledTimes(1);
            done();
            break;
          default:
        }
      });
      const folder = {
        type: FolderTypes.FOLDER,
        _links: {move: {href: 'http://test.url/api/v1/folders/1337/parent'}}
      };

      // When
      folderService.moveFolder(dispatch, {credentials: {}}, folder, targetFolder);

      // Then
      expect(fetch.abortFetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    test('moveFolder, valid folder null target -> move to first level, OK response,' +
      'should return default/root folder with children and set all folders in state', done => {
      // Given
      fetch.abortFetch = jest.fn();
      indexedDbService.renameMessageCache = jest.fn();
      global.fetch = jest.fn((url, options) => {
        expect(options.body).toBeNull();
        return Promise.resolve({ok: true, url, options,
          json: () => ({fromBackend: true,
            children: [{folderId: 'MTMzNw=='/* btoa('1337') */,
              previousFolderId: 'Zm9sZGVyLjEzMzc='/* btoa('folder.1337') */}]})});
      });
      let dispatchCount = 0;
      const dispatch = jest.fn(action => {
        switch (action.type) {
          case ActionTypes.APPLICATION_BE_REQUEST:
          case ActionTypes.APPLICATION_FOLDER_RENAME_OK:
            dispatchCount++;
            break;
          case ActionTypes.FOLDERS_SET:
            dispatchCount++;
            expect(action.payload.length).toEqual(1);
            break;
          case ActionTypes.APPLICATION_BE_REQUEST_COMPLETED:
            expect(dispatchCount).toEqual(3);
            expect(indexedDbService.renameMessageCache).toHaveBeenCalledTimes(1);
            done();
            break;
          default:
        }
      });
      const folder = {
        type: FolderTypes.FOLDER,
        _links: {move: {href: 'http://test.url/api/v1/folders/Zm9sZGVyLjEzMzc=/parent'}}
      };

      // When
      folderService.moveFolder(dispatch, {credentials: {}}, folder);

      // Then
      expect(fetch.abortFetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    test('moveFolder, valid folders, NOT OK response, should complete and not update state', done => {
      // Given
      const targetFolder = {folderId: 'targetFolderId'};
      fetch.abortFetch = jest.fn();
      indexedDbService.renameMessageCache = jest.fn();
      global.fetch = jest.fn((url, options) => {
        expect(options.body).toMatch('targetFolderId');
        return Promise.resolve({ok: false, url, options, json: () => targetFolder});
      });
      let dispatchCount = 0;
      const dispatch = jest.fn(action => {
        dispatchCount++;
        if (action.type === ActionTypes.APPLICATION_BE_REQUEST_COMPLETED) {
          expect(dispatchCount).toEqual(2);
          expect(indexedDbService.renameMessageCache).toHaveBeenCalledTimes(0);
          done();
        }
      });
      const folder = {
        type: FolderTypes.FOLDER,
        _links: {move: {href: 'http://test.url/api/v1/folders/1337/parent'}}
      };

      // When
      folderService.moveFolder(dispatch, {credentials: {}}, folder, targetFolder);

      // Then
      expect(fetch.abortFetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
  describe('deleteFolder', () => {
    test('deleteFolder, valid folder, OK response, should return parent folder with children and update state', done => {
      // Given
      fetch.abortFetch = jest.fn();
      indexedDbService.deleteMessageCache = jest.fn((userId, hash, foldersToDeleteIds) => {
        expect(userId).toEqual('id');
        expect(hash).toEqual('hash');
        expect(foldersToDeleteIds).toEqual(expect.arrayContaining(['parent', 'child1', 'child2', 'child3']));
      });

      global.fetch = jest.fn((url, options) => Promise.resolve(
        {ok: true, url, options, json: () => ({fromBackend: true})}));
      let dispatchCount = 0;
      const dispatch = jest.fn(action => {
        switch (action.type) {
          case ActionTypes.APPLICATION_BE_REQUEST:
            dispatchCount++;
            break;
          case ActionTypes.FOLDERS_UPDATE:
            dispatchCount++;
            expect(action.payload.fromBackend).toEqual(true);
            break;
          case ActionTypes.APPLICATION_BE_REQUEST_COMPLETED:
            expect(dispatchCount).toEqual(2);
            expect(indexedDbService.deleteMessageCache).toHaveBeenCalledTimes(1);
            done();
            break;
          default:
        }
      });
      const folder = {
        type: FolderTypes.FOLDER,
        folderId: 'parent',
        children: [{folderId: 'child1', children: []}, {folderId: 'child2'}, {folderId: 'child3'}],
        _links: {delete: {href: 'http://test.url/api/v1/folders/1337'}}
      };

      // When
      folderService.deleteFolder(dispatch, {credentials: {}, id: 'id', hash: 'hash'}, folder);

      // Then
      expect(fetch.abortFetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    test('deleteFolder, valid folder, NOT OK response, should complete and not update state', done => {
      // Given
      fetch.abortFetch = jest.fn();
      indexedDbService.deleteMessageCache = jest.fn();
      global.fetch = jest.fn((url, options) => Promise.resolve({ok: false, url, options}));
      let dispatchCount = 0;
      const dispatch = jest.fn(action => {
        dispatchCount++;
        if (action.type === ActionTypes.APPLICATION_BE_REQUEST_COMPLETED) {
          expect(dispatchCount).toEqual(2);
          expect(indexedDbService.deleteMessageCache).toHaveBeenCalledTimes(0);
          done();
        }
      });
      const folder = {
        type: FolderTypes.FOLDER,
        _links: {delete: {href: 'http://test.url/api/v1/folders/1337'}}
      };

      // When
      folderService.deleteFolder(dispatch, {credentials: {}}, folder);

      // Then
      expect(fetch.abortFetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
