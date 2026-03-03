import { io } from 'socket.io-client';

const URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Create a new socket instance.
// We can add auth token for authenticated connection.
export const socket = io(URL, {
  autoConnect: false, // We will connect manually when the user is logged in
  auth: (cb) => {
    cb({ token: localStorage.getItem('token') });
  }
});
