/** Canonical sfx names. One per GameEvents member the audio module honors. */
export type SfxName =
  | 'ui:click'
  | 'ui:hover'
  | 'brew:start'
  | 'brew:done'
  | 'order:served'
  | 'combo:change'
  | 'customer:spawn'
  | 'customer:leave'
  | 'order:expired'
  | 'upgrade:bought'
  | 'drink:unlocked'
  | 'achievement'
  | 'goal:complete'
  | 'day:end'
  | 'game:over'
  | 'rush:start'
  | 'action:fail';
