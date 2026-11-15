/** Ação extra do painel de "sem jogadas": o que o botão aciona e como se chama. */
export interface NoMovesAction {
  id: string;
  labelKey: string;
}

/**
 * Cada jogo diz qual é a sua ação extra (por exemplo, "Vaga extra"). Sem isso vale o "tubo
 * extra" da Mistura, que era fixo no portal.
 */
export function noMovesExtraAction(e: { extraId?: string; extraLabelKey?: string }): NoMovesAction {
  return {
    id: e.extraId ?? 'extraTube',
    labelKey: e.extraLabelKey ?? 'nomoves.extraTube',
  };
}
