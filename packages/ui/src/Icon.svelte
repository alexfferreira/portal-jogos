<script lang="ts">
  type Props = { name: string; size?: number };
  let { name, size = 24 }: Props = $props();

  const paths: Record<string, string> = {
    back: 'M15 5l-7 7 7 7',
    pause: 'M8 5v14M16 5v14',
    play: 'M8 5l11 7-11 7z',
    restart: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
    settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
    undo: 'M9 6L4 11l5 5M4 11h9a5 5 0 0 1 0 10h-3',
    plus: 'M12 5v14M5 12h14',
    tubes: 'M6 4v13a2 2 0 0 0 4 0V4M14 4v13a2 2 0 0 0 4 0V4M5 4h6M13 4h6',
    bus: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V17H4zM4 11h16M12 5v6M6.4 18.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0M14.4 18.5a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0',
    cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
    check: 'M5 12.5l4.5 4.5L19 7',
    download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
    upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
    trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
    bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
    close: 'M6 6l12 12M18 6L6 18',
  };

  const filled = $derived(name === 'play');
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width="2.4"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  <path d={paths[name] ?? paths.cube} />
</svg>
