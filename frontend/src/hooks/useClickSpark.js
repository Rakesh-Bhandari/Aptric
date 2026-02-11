import { useEffect } from 'react';

export const useClickSpark = () => {
  useEffect(() => {
    // Port your spark logic here 
    const handleClick = (e) => {
      // Spark animation logic... 
    };
    
    window.addEventListener('click', handleClick);
    
    // Cleanup function to prevent multiple listeners 
    return () => window.removeEventListener('click', handleClick);
  }, []);
};