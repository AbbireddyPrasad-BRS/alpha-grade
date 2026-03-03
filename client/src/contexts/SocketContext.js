import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';

const SocketContext = createContext();

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ user, children }) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      if (!token) return;

      // **THE FIX**: Pass the token in the `auth` object during connection.
      const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:5000', {
        auth: {
          token: token
        }
      });

      setSocket(newSocket);

      // Clean up the connection when the component unmounts or the user logs out.
<<<<<<< HEAD
      return () => newSocket.close();
    } else if (socket) {
      // If the user logs out, disconnect the socket.
      socket.close();
      setSocket(null);
=======
      return () => {
        newSocket.close();
        setSocket(null);
      };
>>>>>>> a60a2c0 (fixed error in client production)
    }
  }, [user]); // This effect runs whenever the user's login state changes.

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};