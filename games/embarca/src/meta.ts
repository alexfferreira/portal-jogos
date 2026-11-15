import type { Dictionary, GameMeta, Locale } from '@recreio/core';

/** Metadados leves: o portal os lê sem carregar o código do jogo (Three.js etc.). */
export const EMBARCA_ID = 'embarca';

export const meta: GameMeta = {
  titleKey: 'embarca.title',
  descriptionKey: 'embarca.description',
  icon: 'bus',
  mode: 'levels',
  orientation: 'portrait',
};

export const messages: Record<Locale, Dictionary> = {
  'pt-BR': {
    'embarca.title': 'Embarca',
    'embarca.description': 'Mande os veículos na ordem certa.',
    'embarca.canvas.label': 'Tabuleiro de estacionamento com veículos e fila de passageiros',
    'embarca.error.generate':
      'Não foi possível criar a próxima fase. Toque em Reiniciar para tentar de novo.',
  },
  en: {
    'embarca.title': 'Board',
    'embarca.description': 'Send the vehicles out in the right order.',
    'embarca.canvas.label': 'Parking board with vehicles and a queue of passengers',
    'embarca.error.generate': 'Could not create the next level. Tap Restart to try again.',
  },
  es: {
    'embarca.title': 'Embarca',
    'embarca.description': 'Envía los vehículos en el orden correcto.',
    'embarca.canvas.label': 'Tablero de estacionamiento con vehículos y fila de pasajeros',
    'embarca.error.generate':
      'No se pudo crear el siguiente nivel. Toca Reiniciar para intentarlo de nuevo.',
  },
};
