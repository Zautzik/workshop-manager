'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import es from './locales/es.json';

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			en: { translation: en },
			es: { translation: es },
		},
		fallbackLng: 'es', // Default to Spanish for Chilean users
		detection: {
			order: ['localStorage', 'navigator', 'htmlTag'],
			caches: ['localStorage'],
			lookupLocalStorage: 'i18nextLng',
		},
		interpolation: {
			escapeValue: false,
		},
	});

export default i18n;
