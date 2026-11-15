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
    'embarca.powerup.undo': 'Desfazer',
    'embarca.powerup.extraSlot': 'Vaga extra',
    'embarca.powerup.hint': 'Dica',
    'embarca.hint.limit': 'Não achei uma dica agora. Tente de novo.',
    'embarca.tutorial.tap': 'Toque em um veículo livre para mandá-lo para uma vaga.',
    'embarca.tutorial.queue': 'Os passageiros embarcam no veículo da mesma cor, na ordem da fila.',
    'embarca.tutorial.blocked':
      'Um veículo com outro na frente bate e volta. Mande primeiro o que está livre.',
  },
  en: {
    'embarca.title': 'Board',
    'embarca.description': 'Send the vehicles out in the right order.',
    'embarca.canvas.label': 'Parking board with vehicles and a queue of passengers',
    'embarca.error.generate': 'Could not create the next level. Tap Restart to try again.',
    'embarca.powerup.undo': 'Undo',
    'embarca.powerup.extraSlot': 'Extra slot',
    'embarca.powerup.hint': 'Hint',
    'embarca.hint.limit': 'Could not find a hint right now. Try again.',
    'embarca.tutorial.tap': 'Tap a free vehicle to send it to a slot.',
    'embarca.tutorial.queue': 'Passengers board the vehicle of the same color, in queue order.',
    'embarca.tutorial.blocked':
      'A vehicle with another one in front bumps and comes back. Send the free one first.',
  },
  es: {
    'embarca.title': 'Embarca',
    'embarca.description': 'Envía los vehículos en el orden correcto.',
    'embarca.canvas.label': 'Tablero de estacionamiento con vehículos y fila de pasajeros',
    'embarca.error.generate':
      'No se pudo crear el siguiente nivel. Toca Reiniciar para intentarlo de nuevo.',
    'embarca.powerup.undo': 'Deshacer',
    'embarca.powerup.extraSlot': 'Plaza extra',
    'embarca.powerup.hint': 'Pista',
    'embarca.hint.limit': 'No encontré una pista ahora. Inténtalo de nuevo.',
    'embarca.tutorial.tap': 'Toca un vehículo libre para enviarlo a una plaza.',
    'embarca.tutorial.queue':
      'Los pasajeros suben al vehículo del mismo color, en el orden de la fila.',
    'embarca.tutorial.blocked':
      'Un vehículo con otro delante choca y vuelve. Envía primero el que está libre.',
  },
};
