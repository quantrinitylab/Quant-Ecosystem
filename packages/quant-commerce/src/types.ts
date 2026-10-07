export enum TravelProvider {
  indigo = 'indigo',
  airIndia = 'airIndia',
  makemytrip = 'makemytrip',
  cleartrip = 'cleartrip',
  goibibo = 'goibibo',
}

export enum TrainProvider {
  irctc = 'irctc',
  confirmtkt = 'confirmtkt',
  railyatri = 'railyatri',
}

export enum ShoppingMerchant {
  amazon = 'amazon',
  flipkart = 'flipkart',
  myntra = 'myntra',
  ajio = 'ajio',
  meesho = 'meesho',
}

export enum SortBy {
  price = 'price',
  rating = 'rating',
  relevance = 'relevance',
  delivery = 'delivery',
}

export enum OrderStatus {
  placed = 'placed',
  confirmed = 'confirmed',
  shipped = 'shipped',
  outForDelivery = 'outForDelivery',
  delivered = 'delivered',
  returned = 'returned',
  refunded = 'refunded',
}

export interface FlightResult {
  id: string;
  airline: string;
  from: string;
  to: string;
  departureTime: number;
  arrivalTime: number;
  duration: number;
  stops: number;
  price: number;
  currency: string;
  class: string;
  provider: TravelProvider;
}

export interface HotelResult {
  id: string;
  name: string;
  location: string;
  checkIn: string;
  checkOut: string;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  rating: number;
  amenities: string[];
  provider: TravelProvider;
}

export interface TrainResult {
  id: string;
  trainNumber: string;
  trainName: string;
  from: string;
  to: string;
  departureTime: number;
  arrivalTime: number;
  duration: number;
  classes: { name: string; availability: number; price: number }[];
  provider: TrainProvider;
}

export interface ShoppingItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  currency: string;
  merchant: ShoppingMerchant;
  category: string;
  url: string;
  rating: number;
  reviewCount: number;
}

export interface PriceAlert {
  id: string;
  itemId: string;
  targetPrice: number;
  currentPrice: number;
  active: boolean;
  createdAt: number;
  lastChecked: number;
  notified: boolean;
  autoBuy: boolean;
  autoBuyConfirmed?: boolean;
  maxAutoBuyAmount?: number;
}

export interface Order {
  id: string;
  merchantOrderId: string;
  merchant: ShoppingMerchant;
  items: string[];
  status: OrderStatus;
  trackingUrl: string;
  estimatedDelivery: number;
  orderedAt: number;
  lastUpdate: number;
}

export interface MerchantSearch {
  query: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: SortBy;
  merchants?: ShoppingMerchant[];
}

export interface Wishlist {
  id: string;
  name: string;
  items: ShoppingItem[];
}

export interface ComparisonResult {
  query: string;
  results: ShoppingItem[];
  bestPrice: ShoppingItem | null;
  bestRating: ShoppingItem | null;
  searchedAt: number;
}

export interface TravelItinerary {
  id: string;
  name: string;
  flights: FlightResult[];
  trains: TrainResult[];
  hotels: HotelResult[];
  totalCost: number;
  currency: string;
  startDate: string;
  endDate: string;
}
