import { Group, Mesh, MeshBasicMaterial, type Material } from 'three';
import { Assets, LIQUID_RADIUS } from './assets';
import { TUBE, tubeHeight } from './layout';
import { HIDDEN_SYMBOL } from './symbols';
import { isCompleteData, type TubeData } from './plan';

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Um tubo na cena: vidro, líquido (uma malha por unidade, com altura fracionária para
 * animar os níveis), símbolos, tampa e halo de destaque. A origem do grupo é o centro da
 * base do vidro. Só reflete dados; não conhece regras.
 */
export class TubeView {
  readonly group = new Group();
  readonly height: number;
  /** Posição de repouso do centro da base (mundo). */
  restX = 0;
  restY = 0;
  /** Quanto o tubo está levantado (seleção) e deslocado (tremor). */
  lift = 0;
  offsetX = 0;
  colors: number[] = [];
  hidden: boolean[] = [];
  /** Nível de líquido em unidades (fracionário durante a animação). */
  level = 0;
  private colorblind = false;
  private readonly units: Mesh[] = [];
  private readonly symbols: Mesh[] = [];
  private readonly surface: Mesh;
  private readonly shine: Mesh;
  private readonly cap: Mesh;
  private readonly halo: Mesh;
  private readonly haloMaterial: MeshBasicMaterial;
  private capColor = -1;

  constructor(
    private readonly assets: Assets,
    readonly capacity: number,
  ) {
    const cap = assets.forCapacity(capacity);
    this.height = tubeHeight(capacity);
    const g = this.group;

    this.haloMaterial = new MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.halo = new Mesh(cap.halo, this.haloMaterial);
    this.halo.position.z = -0.3;
    this.halo.visible = false;
    g.add(this.halo);

    for (let i = 0; i < capacity; i++) {
      const unit = new Mesh(i === 0 ? assets.unitBottom : assets.unitMid, assets.hiddenUnit);
      unit.position.y = TUBE.bottomPad + i * TUBE.unitHeight;
      unit.visible = false;
      this.units.push(unit);
      g.add(unit);
      const symbol = new Mesh(assets.atlas.geometries[0], assets.symbolMaterial);
      symbol.position.z = LIQUID_RADIUS + 0.012;
      symbol.visible = false;
      symbol.renderOrder = 2;
      this.symbols.push(symbol);
      g.add(symbol);
    }
    this.surface = new Mesh(assets.surface, assets.hiddenUnit);
    this.surface.visible = false;
    this.shine = new Mesh(assets.surface, assets.shine);
    this.shine.visible = false;
    g.add(this.surface, this.shine);

    this.cap = new Mesh(assets.cap, assets.liquid[0]);
    this.cap.visible = false;
    g.add(this.cap);

    const glass = new Mesh(cap.glass, assets.glass);
    glass.renderOrder = 1;
    g.add(glass);
    const highlight = new Mesh(cap.highlight, assets.highlight);
    highlight.position.set(-TUBE.radius * 0.56, 0, TUBE.radius * 0.83);
    highlight.renderOrder = 3;
    g.add(highlight);
    if (assets.rimGeometry && assets.rim) {
      const rim = new Mesh(assets.rimGeometry, assets.rim);
      rim.position.y = this.height;
      rim.renderOrder = 3;
      g.add(rim);
    }
  }

  /** Mostra exatamente estes dados (nível = quantidade de unidades). */
  setData(data: TubeData): void {
    this.colors = [...data.colors];
    this.hidden = [...data.hidden];
    this.level = this.colors.length;
    this.refresh();
    this.setCap(isCompleteData(data, this.capacity) ? (this.colors[0] ?? -1) : -1);
  }

  /** Muda só o nível (animação de despejo). */
  setLevel(level: number): void {
    this.level = level;
    this.layoutUnits();
  }

  /** Atribui a cor de uma posição (usado ao receber o líquido, antes de o nível subir). */
  setUnit(index: number, color: number, hidden: boolean): void {
    this.colors[index] = color;
    this.hidden[index] = hidden;
    this.refreshUnit(index);
    this.layoutUnits();
  }

  /** Corta o excesso de unidades (a origem esvaziou). */
  truncate(count: number): void {
    this.colors.length = count;
    this.hidden.length = count;
    this.level = count;
    this.layoutUnits();
  }

  setColorblind(on: boolean): void {
    this.colorblind = on;
    this.layoutUnits();
  }

  /** Quantos símbolos estão visíveis agora (diagnóstico/teste). */
  visibleSymbols(): number {
    return this.symbols.filter((s) => s.visible).length;
  }

  /** Mostra a tampa (cor da PALETTE) ou a esconde (-1). `drop` > 0 a ergue (animação). */
  setCap(color: number, drop = 0, scale = 1): void {
    this.capColor = color;
    if (color < 0) {
      this.cap.visible = false;
      return;
    }
    this.cap.visible = true;
    this.cap.material = this.assets.liquid[color] as Material;
    this.cap.position.y = this.height - 0.1 + drop;
    this.cap.scale.setScalar(scale);
  }

  get capped(): boolean {
    return this.capColor >= 0;
  }

  /** Destaque colorido atrás do tubo (dica, tutorial, brilho de completo). `null` apaga. */
  setHalo(color: number | null, opacity = 0.7, scale = 1): void {
    if (color === null || opacity <= 0.001) {
      this.halo.visible = false;
      return;
    }
    this.haloMaterial.color.setHex(color);
    this.haloMaterial.opacity = opacity;
    this.halo.scale.setScalar(scale);
    this.halo.visible = true;
  }

  /** Efeito de "pop" numa unidade (revelação): escala horizontal e vertical. */
  popUnit(index: number, scale: number): void {
    const unit = this.units[index];
    const symbol = this.symbols[index];
    if (unit) {
      unit.scale.x = unit.scale.z = scale;
    }
    if (symbol) symbol.scale.setScalar(scale);
  }

  /** Volta a escala de todas as unidades a 1 (fim de qualquer "pop"). */
  popUnitsReset(): void {
    for (let i = 0; i < this.capacity; i++) this.popUnit(i, 1);
  }

  private refresh(): void {
    for (let i = 0; i < this.capacity; i++) this.refreshUnit(i);
    this.layoutUnits();
  }

  private refreshUnit(i: number): void {
    const unit = this.units[i];
    const color = this.colors[i];
    if (!unit || color === undefined) return;
    unit.material = this.hidden[i]
      ? this.assets.hiddenUnit
      : (this.assets.liquid[color] as Material);
  }

  private layoutUnits(): void {
    const uh = TUBE.unitHeight;
    for (let i = 0; i < this.capacity; i++) {
      const unit = this.units[i] as Mesh;
      const symbol = this.symbols[i] as Mesh;
      const f = clamp01(this.level - i);
      const present = f > 0.001 && this.colors[i] !== undefined;
      unit.visible = present;
      unit.scale.y = Math.max(f, 0.001);
      const wantSymbol = present && (this.hidden[i] === true || this.colorblind);
      symbol.visible = wantSymbol && f > 0.85;
      if (wantSymbol) {
        const idx = this.hidden[i] ? HIDDEN_SYMBOL : (this.colors[i] as number);
        symbol.geometry = this.assets.atlas.geometries[idx] ?? this.assets.atlas.geometries[0]!;
        symbol.position.y = TUBE.bottomPad + i * uh + (f * uh) / 2;
      }
    }
    const top = Math.ceil(this.level - 1e-6) - 1;
    const showSurface = this.level > 0.02 && top >= 0 && this.colors[top] !== undefined;
    this.surface.visible = showSurface;
    this.shine.visible = showSurface;
    if (showSurface) {
      const y = TUBE.bottomPad + this.level * uh;
      this.surface.position.y = y;
      this.shine.position.y = y + 0.004;
      this.surface.material = this.hidden[top]
        ? this.assets.hiddenUnit
        : (this.assets.liquid[this.colors[top] as number] as Material);
    }
  }

  /** Nenhum recurso próprio de GPU além do material do halo (o resto é compartilhado). */
  dispose(): void {
    this.haloMaterial.dispose();
    this.group.removeFromParent();
  }
}
