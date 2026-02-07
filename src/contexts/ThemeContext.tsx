/**
 * @fileoverview Theme Context (Light/Dark Mode)
 * 
 * SYSTEM ROLE: UI Theme State Manager
 * ORGAN ANALOGY: The "Lighting System" - Controls application appearance (light/dark mode)
 * 
 * This context manages:
 * - Current theme (light or dark)
 * - Theme persistence in localStorage
 * - Toggling dark class on root HTML element for CSS framework
 * - Global theme state accessible via useTheme() hook
 * 
 * When user toggles theme:
 * 1. New theme is set in state
 * 2. Preference is saved to localStorage
 * 3. Dark class is added/removed from <html> element
 * 4. Tailwind CSS respects dark: class selector for styling
 * 
 * Provides consistent dark/light mode across all pages and components.
 */
'use client';

import React, {
	createContext,
	useContext,
	useState,
	useEffect,
	ReactNode,
} from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
	theme: Theme;
	toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({
	children,
}) => {
	const [theme, setTheme] = useState<Theme>('light');

	useEffect(() => {
		const savedTheme = localStorage.getItem('theme') as Theme;
		if (savedTheme) {
			setTheme(savedTheme);
			document.documentElement.classList.toggle('dark', savedTheme === 'dark');
		}
	}, []);

	const toggleTheme = () => {
		const newTheme = theme === 'light' ? 'dark' : 'light';
		setTheme(newTheme);
		localStorage.setItem('theme', newTheme);
		document.documentElement.classList.toggle('dark', newTheme === 'dark');
	};

	return (
		<ThemeContext.Provider value={{ theme, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
};

export const useTheme = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useTheme must be used within a ThemeProvider');
	}
	return context;
};
