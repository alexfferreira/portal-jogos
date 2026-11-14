import type { Dictionary, GameMeta, Locale } from '@recreio/core';

/** Metadados leves: o portal os lê sem carregar o código do jogo (Three.js etc.). */
export const MISTURA_ID = 'mistura';

export const meta: GameMeta = {
  titleKey: 'mistura.title',
  descriptionKey: 'mistura.description',
  icon: 'tubes',
  mode: 'levels',
  orientation: 'portrait',
};

export const messages: Record<Locale, Dictionary> = {
  'pt-BR': {
    'mistura.title': 'Mistura',
    'mistura.description': 'Ordene as cores nos tubos.',
    'mistura.powerup.undo': 'Desfazer',
    'mistura.powerup.extraTube': 'Tubo extra',
  },
  en: {
    'mistura.title': 'Mix',
    'mistura.description': 'Sort the colors into tubes.',
    'mistura.powerup.undo': 'Undo',
    'mistura.powerup.extraTube': 'Extra tube',
  },
  es: {
    'mistura.title': 'Mezcla',
    'mistura.description': 'Ordena los colores en los tubos.',
    'mistura.powerup.undo': 'Deshacer',
    'mistura.powerup.extraTube': 'Tubo extra',
  },
};
