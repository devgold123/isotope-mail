import {INITIAL_STATE} from './';
import {ActionTypes} from '../actions/action-types';

const application = (state = INITIAL_STATE.application, action) => {
  switch (action.type) {
    case ActionTypes.APPLICATION_BE_REQUEST:
      return {...state, activeRequests: state.activeRequests + 1};
    case ActionTypes.APPLICATION_BE_REQUEST_COMPLETED:
      return {...state, activeRequests: state.activeRequests > 0 ? state.activeRequests - 1 : 0};
    case ActionTypes.APPLICATION_USER_CREDENTIALS_SET:
      return {
        ...state, user: {
          ...state.user,
          id: action.payload.userId, hash: action.payload.hash, credentials: action.payload.credentials
        }
      };
    case ActionTypes.APPLICATION_FOLDER_SELECT:
      return {...state, selectedFolder: {...action.payload}};
    case ActionTypes.APPLICATION_MESSAGE_SELECT:
      return {...state, selectedMessage: {...action.payload}};
    case ActionTypes.APPLICATION_MESSAGE_REFRESH:
      if (state.selectedFolder.folderId === action.payload.folder.folderId
        && state.selectedMessage.uid === action.payload.message.uid) {
        return {...state, selectedMessage: {...action.payload.message}};
      }
      return state;
    case ActionTypes.APPLICATION_MESSAGE_REPLACE_IMAGE: {
      if (state.selectedFolder.folderId === action.payload.folder.folderId
        && state.selectedMessage.uid === action.payload.message.uid) {
        const contentId = action.payload.attachment.contentId.replace(/[<>]/g, '');
        const objectUrl = URL.createObjectURL(action.payload.blob);
        const parsedMessage = state.selectedMessage.content.replace(`cid:${contentId}`, objectUrl);
        return {...state, selectedMessage: {...state.selectedMessage, content: parsedMessage}};
      }
      return state;
    }
    case ActionTypes.APPLICATION_ERROR_SET:
      const errorsSetState = {...state};
      errorsSetState.errors = {...state.erro}
      errorsSetState.errors[action.payload.type] = action.payload.value;
      return errorsSetState;
    default:
      return state;
  }
}

export default application;
