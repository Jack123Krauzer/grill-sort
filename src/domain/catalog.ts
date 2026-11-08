import type { BoosterId, Food } from './types.js';

const foods: Food[] = [
  { id: 'sausage', name: 'Sausage', emoji: '🌭', color: '#d76a48', family: 'red' },
  { id: 'corn', name: 'Corn', emoji: '🌽', color: '#ffc44d', family: 'gold' },
  { id: 'mushroom', name: 'Mushroom', emoji: '🍄', color: '#d15a42', family: 'red' },
  { id: 'shrimp', name: 'Shrimp', emoji: '🍤', color: '#ffb365', family: 'gold' },
  { id: 'steak', name: 'Steak', emoji: '🥩', color: '#c74655', family: 'red' },
  { id: 'broccoli', name: 'Broccoli', emoji: '🥦', color: '#54a95f', family: 'green' },
  { id: 'pepper', name: 'Bell pepper', emoji: '🫑', color: '#47b76a', family: 'green' },
  { id: 'fish', name: 'Fish', emoji: '🐟', color: '#7f93de', family: 'purple' },
  { id: 'tomato', name: 'Tomato', emoji: '🍅', color: '#e24e52', family: 'red' },
  { id: 'eggplant', name: 'Eggplant', emoji: '🍆', color: '#985cc6', family: 'purple' },
  { id: 'pineapple', name: 'Pineapple', emoji: '🍍', color: '#f0b536', family: 'gold' },
  { id: 'onion', name: 'Red onion', emoji: '🧅', color: '#c691d8', family: 'purple' },
  { id: 'zucchini', name: 'Zucchini', emoji: '🥒', color: '#72b847', family: 'green' },
];

export const FOODS: Record<string, Food> = Object.fromEntries(foods.map((food) => [food.id, food]));

export const BOOSTERS: Record<BoosterId, { id: BoosterId; name: string; emoji: string; description: string; cost: number }> = {
  collect: { id: 'collect', name: 'Collect', emoji: '🧺', description: 'Collect three exposed foods that match.', cost: 130 },
  shuffle: { id: 'shuffle', name: 'Shuffle', emoji: '🔀', description: 'Rearrange the exposed food and empty slots.', cost: 90 },
  time: { id: 'time', name: '+30 sec', emoji: '⏳', description: 'Add 30 seconds to the level clock.', cost: 100 },
  open: { id: 'open', name: 'Open', emoji: '🔓', description: 'Remove one food cover or ice block.', cost: 110 },
};
