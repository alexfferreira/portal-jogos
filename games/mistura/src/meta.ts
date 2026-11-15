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
    'mistura.powerup.hint': 'Dica',
    'mistura.canvas.label': 'Tabuleiro com tubos de líquidos coloridos',
    'mistura.error.generate':
      'Não foi possível criar a próxima fase. Toque em Reiniciar para tentar de novo.',
    'mistura.hint.limit': 'Não achei uma dica agora. Tente de novo.',
    'mistura.tutorial.select': 'Toque em um tubo para pegar o líquido de cima.',
    'mistura.tutorial.pour': 'Agora toque em outro tubo para despejar.',
    'mistura.tutorial.cancel': 'Toque no mesmo tubo de novo para cancelar.',
    'mistura.tutorial.rules': 'Só dá para despejar sobre a mesma cor ou em um tubo vazio.',
  },
  en: {
    'mistura.title': 'Mix',
    'mistura.description': 'Sort the colors into tubes.',
    'mistura.powerup.undo': 'Undo',
    'mistura.powerup.extraTube': 'Extra tube',
    'mistura.powerup.hint': 'Hint',
    'mistura.canvas.label': 'Board with tubes of colored liquids',
    'mistura.error.generate': 'Could not create the next level. Tap Restart to try again.',
    'mistura.hint.limit': 'Could not find a hint right now. Try again.',
    'mistura.tutorial.select': 'Tap a tube to pick up the liquid on top.',
    'mistura.tutorial.pour': 'Now tap another tube to pour.',
    'mistura.tutorial.cancel': 'Tap the same tube again to cancel.',
    'mistura.tutorial.rules': 'You can only pour onto the same color or into an empty tube.',
  },
  es: {
    'mistura.title': 'Mezcla',
    'mistura.description': 'Ordena los colores en los tubos.',
    'mistura.powerup.undo': 'Deshacer',
    'mistura.powerup.extraTube': 'Tubo extra',
    'mistura.powerup.hint': 'Pista',
    'mistura.canvas.label': 'Tablero con tubos de líquidos de colores',
    'mistura.error.generate':
      'No se pudo crear el siguiente nivel. Toca Reiniciar para intentarlo de nuevo.',
    'mistura.hint.limit': 'No encontré una pista ahora. Inténtalo de nuevo.',
    'mistura.tutorial.select': 'Toca un tubo para tomar el líquido de arriba.',
    'mistura.tutorial.pour': 'Ahora toca otro tubo para verter.',
    'mistura.tutorial.cancel': 'Toca el mismo tubo otra vez para cancelar.',
    'mistura.tutorial.rules': 'Solo puedes verter sobre el mismo color o en un tubo vacío.',
  },
};
