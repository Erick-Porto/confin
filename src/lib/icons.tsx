import {
  Baby,
  Banknote,
  Bike,
  Book,
  Briefcase,
  Bus,
  Car,
  CircleDollarSign,
  CirclePlus,
  Coffee,
  CreditCard,
  Dumbbell,
  Ellipsis,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Hammer,
  HeartPulse,
  House,
  KeyRound,
  Landmark,
  Laptop,
  PartyPopper,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Stethoscope,
  Tag,
  Target,
  TrainFront,
  TrendingUp,
  Tv,
  Undo2,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  Droplet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Ícones disponíveis para categorias. A chave é o valor salvo em categories.icon.
 * Para adicionar um ícone, confira se o nome existe em lucide-react 1.x
 * (node_modules/lucide-react/dist/lucide-react.d.ts) e inclua aqui.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  house: House,
  'key-round': KeyRound,
  zap: Zap,
  droplet: Droplet,
  wifi: Wifi,
  sofa: Sofa,
  wrench: Wrench,
  hammer: Hammer,
  utensils: Utensils,
  'shopping-cart': ShoppingCart,
  coffee: Coffee,
  car: Car,
  fuel: Fuel,
  bus: Bus,
  'train-front': TrainFront,
  bike: Bike,
  plane: Plane,
  smartphone: Smartphone,
  'heart-pulse': HeartPulse,
  stethoscope: Stethoscope,
  pill: Pill,
  dumbbell: Dumbbell,
  'graduation-cap': GraduationCap,
  book: Book,
  laptop: Laptop,
  'party-popper': PartyPopper,
  film: Film,
  'gamepad-2': Gamepad2,
  tv: Tv,
  repeat: Repeat,
  shirt: Shirt,
  sparkles: Sparkles,
  baby: Baby,
  'paw-print': PawPrint,
  gift: Gift,
  receipt: Receipt,
  landmark: Landmark,
  'credit-card': CreditCard,
  wallet: Wallet,
  briefcase: Briefcase,
  'trending-up': TrendingUp,
  'piggy-bank': PiggyBank,
  'hand-coins': HandCoins,
  banknote: Banknote,
  'circle-dollar-sign': CircleDollarSign,
  target: Target,
  'undo-2': Undo2,
  'circle-plus': CirclePlus,
  ellipsis: Ellipsis,
  tag: Tag,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** Cores sugeridas para categorias e contas (seletor de cor). */
export const COLOR_OPTIONS = [
  '#0F766E',
  '#16A34A',
  '#65A30D',
  '#CA8A04',
  '#D97706',
  '#EA580C',
  '#DC2626',
  '#E11D48',
  '#DB2777',
  '#9333EA',
  '#7C3AED',
  '#4F46E5',
  '#2563EB',
  '#0891B2',
  '#0D9488',
  '#475569',
  '#64748B',
  '#1F2937',
];

/** Ícone redondo de categoria com fundo na cor da categoria. */
export function CategoryIcon({
  name,
  color,
  size = 36,
  className = '',
}: {
  name: string | null | undefined;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const Icon = (name && CATEGORY_ICONS[name]) || Tag;
  const c = color || '#64748B';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ width: size, height: size, backgroundColor: `${c}1F`, color: c }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}
