import { createContext, useContext } from 'react';

// Things any wallpaper tile can do (open preview, set wallpaper, ...). Provided by App.jsx.
export const ActionsContext = createContext(null);
export const useActions = () => useContext(ActionsContext);
