/** Área do conteúdo no plano XZ (largura em X, profundidade em Z), em unidades do mundo. */
export interface Bounds {
  width: number;
  depth: number;
}

const DEG = Math.PI / 180;

/**
 * Câmera ortográfica de cima: meia-largura e meia-altura do frustum para o
 * conteúdo caber inteiro em qualquer proporção (`aspect` = largura/altura da tela).
 */
export function fitOrthographic(
  bounds: Bounds,
  aspect: number,
  margin = 1.08,
): { halfWidth: number; halfHeight: number } {
  const needH = Math.max(bounds.depth, bounds.width / aspect) * margin;
  return { halfHeight: needH / 2, halfWidth: (needH * aspect) / 2 };
}

/**
 * Câmera em perspectiva inclinada: distância do alvo para o conteúdo caber.
 * `elevationDeg` é o ângulo da câmera acima do plano (90 = de cima).
 */
export function fitPerspective(
  bounds: Bounds,
  aspect: number,
  fovDeg: number,
  elevationDeg: number,
  margin = 1.08,
): number {
  const tanHalf = Math.tan((fovDeg * DEG) / 2);
  // A profundidade aparece encurtada pelo seno da elevação.
  const visibleDepth = bounds.depth * Math.sin(elevationDeg * DEG);
  const distV = visibleDepth / 2 / tanHalf;
  const distH = bounds.width / 2 / (tanHalf * aspect);
  return Math.max(distV, distH) * margin;
}
