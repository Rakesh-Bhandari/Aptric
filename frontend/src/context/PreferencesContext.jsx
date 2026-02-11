// src/context/PreferencesContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const PreferencesContext = createContext();

export const PreferencesProvider = ({ children }) => {
    // 1. Initialize state from localStorage or defaults
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('theme') || 'dark';
    });

    const [reduceMotion, setReduceMotion] = useState(() => {
        return localStorage.getItem('reduceMotion') === 'true';
    });

    // 2. Apply Theme Side Effects
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // 3. Apply Motion Side Effects (UPDATED)
    useEffect(() => {
        // Sets a data attribute on the <html> tag so CSS can detect it
        document.documentElement.setAttribute('data-reduce-motion', reduceMotion);
        localStorage.setItem('reduceMotion', reduceMotion);
    }, [reduceMotion]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const toggleMotion = () => {
        setReduceMotion(prev => !prev);
    };

    return (
        <PreferencesContext.Provider value={{ theme, toggleTheme, reduceMotion, toggleMotion }}>
            {children}
        </PreferencesContext.Provider>
    );
};

export const usePreferences = () => useContext(PreferencesContext);