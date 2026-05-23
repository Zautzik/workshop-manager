'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';

// Always initialise in Spanish so SSR and the first client render agree,
// eliminating the React hydration mismatch. User preference is restored from
// localStorage by LanguageProvider after mount.
i18n
	.use(initReactI18next)
	.init({
		resources: {
			en: { translation: en },
			es: { translation: es },
		},
		lng: 'es',
		fallbackLng: 'es',
		interpolation: {
			escapeValue: false,
		},
	});

export default i18n;
