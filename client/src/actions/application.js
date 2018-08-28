import {ActionTypes} from './action-types';

export const backendRequest = () => ({type: ActionTypes.APPLICATION_BE_REQUEST});
export const backendRequestCompleted = () => ({type: ActionTypes.APPLICATION_BE_REQUEST_COMPLETED});
export const setUserCredentials = (userId, hash, credentials) =>
  ({type: ActionTypes.APPLICATION_USER_CREDENTIALS_SET, payload: {userId, hash, credentials}});
export const selectFolder = folder => ({type: ActionTypes.APPLICATION_FOLDER_SELECT, payload: folder});
export const selectMessage = message => ({type: ActionTypes.APPLICATION_MESSAGE_SELECT, payload: message});
/**
 * Refreshes the current selectedMessage if it's still the same (same selectedFolder and same selectedMessage)
 *
 * @param folder
 * @param message
 * @returns {{type: string, payload: {folder: *, message: *}}}
 */
export const refreshMessage = (folder, message) =>
  ({type: ActionTypes.APPLICATION_MESSAGE_REFRESH, payload: {folder, message}});
export const setError = (type, value) => ({type: ActionTypes.APPLICATION_ERROR_SET, payload: {type, value}});
