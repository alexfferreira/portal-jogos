import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';
import type { Quality } from '../services/settings';

/**
 * Material "brinquedo": plástico liso com leve brilho. Na qualidade alta usa
 * verniz (clearcoat); na baixa, o material padrão, mais barato.
 */
export function createToyMaterial(hex: number, quality: Quality = 'high'): Material {
  if (quality === 'low') {
    return new MeshStandardMaterial({ color: new Color(hex), roughness: 0.45, metalness: 0 });
  }
  return new MeshPhysicalMaterial({
    color: new Color(hex),
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
  });
}
