// ============================================================================
// @quant/shared-ui - Advanced Frontend Systems Type Definitions
// ============================================================================

// State Management Types
export interface Action<T = string, P = any> {
  type: T;
  payload?: P;
  meta?: Record<string, any>;
  error?: boolean;
}

export type Reducer<S = any, A extends Action = Action> = (state: S, action: A) => S;

export type Selector<S = any, R = any> = (state: S) => R;

export type Dispatch = (action: Action | ThunkAction) => any;

export type ThunkAction<S = any> = (dispatch: Dispatch, getState: () => S) => any;

export type Unsubscribe = () => void;

export interface MiddlewareAPI<S = any> {
  dispatch: Dispatch;
  getState: () => S;
}

export type Middleware<S = any> = (
  api: MiddlewareAPI<S>,
) => (next: Dispatch) => (action: Action) => any;

export interface Store<S = any> {
  dispatch: Dispatch;
  getState: () => S;
  subscribe: (listener: () => void) => Unsubscribe;
  replaceReducer: (nextReducer: Reducer<S>) => void;
  getHistory: () => StateHistoryEntry<S>[];
  jumpToState: (index: number) => void;
}

export interface StateHistoryEntry<S = any> {
  state: S;
  action: Action;
  timestamp: number;
}

// Router Types
export interface Route {
  path: string;
  component?: string;
  load?: () => Promise<any>;
  children?: Route[];
  guards?: RouteGuard[];
  meta?: RouteMeta;
  redirect?: string;
}

export interface RouteMatch {
  route: Route;
  params: RouteParams;
  query: Record<string, string>;
  path: string;
  matched: Route[];
}

export type RouteParams = Record<string, string>;

export interface RouteGuard {
  canActivate?: (to: RouteMatch, from: RouteMatch | null) => Promise<boolean> | boolean;
  canDeactivate?: (from: RouteMatch, to: RouteMatch) => Promise<boolean> | boolean;
}

export interface NavigationEvent {
  type: 'push' | 'replace' | 'pop' | 'forward' | 'back';
  from: RouteMatch | null;
  to: RouteMatch;
  timestamp: number;
}

export interface RouterConfig {
  routes: Route[];
  base?: string;
  mode?: 'history' | 'hash';
  scrollBehavior?: 'top' | 'restore' | 'none';
}

export interface RouteMeta {
  title?: string;
  requiresAuth?: boolean;
  roles?: string[];
  [key: string]: any;
}

// Form Library Types
export interface FormState<T = Record<string, any>> {
  values: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  dirty: Record<string, boolean>;
  isSubmitting: boolean;
  isValid: boolean;
  submitCount: number;
}

export interface FormField<V = any> {
  name: string;
  value: V;
  error: string | null;
  touched: boolean;
  dirty: boolean;
  validating: boolean;
  disabled: boolean;
}

export interface FieldValidation {
  valid: boolean;
  error: string | null;
}

export interface ValidationRule {
  type: ValidationType;
  value?: any;
  message: string;
  validator?: (value: any, formValues: Record<string, any>) => boolean | Promise<boolean>;
}

export type ValidationType =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'email'
  | 'min'
  | 'max'
  | 'custom'
  | 'async';

export interface FieldArray<T = any> {
  fields: T[];
  append: (value: T) => void;
  remove: (index: number) => void;
  move: (from: number, to: number) => void;
  insert: (index: number, value: T) => void;
  swap: (indexA: number, indexB: number) => void;
}

export interface FormSchema {
  fields: FormFieldSchema[];
  crossFieldValidation?: CrossFieldRule[];
}

export interface FormFieldSchema {
  name: string;
  type: string;
  label?: string;
  initialValue?: any;
  rules?: ValidationRule[];
  conditional?: ConditionalConfig;
}

export interface ConditionalConfig {
  field: string;
  operator: 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan';
  value: any;
  action: 'show' | 'hide' | 'disable' | 'enable';
}

export interface CrossFieldRule {
  fields: string[];
  validator: (values: Record<string, any>) => Record<string, string> | null;
  message: string;
}

// Animation Engine Types
export interface AnimationConfig {
  duration?: number;
  delay?: number;
  easing?: EasingFunction;
  iterations?: number;
  direction?: 'normal' | 'reverse' | 'alternate';
  fill?: 'none' | 'forwards' | 'backwards' | 'both';
}

export interface Spring {
  mass: number;
  tension: number;
  friction: number;
  velocity: number;
  position: number;
  target: number;
  atRest: boolean;
}

export interface SpringConfig {
  mass?: number;
  tension?: number;
  friction?: number;
  precision?: number;
}

export interface Keyframe {
  offset: number;
  properties: Record<string, number>;
  easing?: EasingFunction;
}

export interface Timeline {
  id: string;
  duration: number;
  currentTime: number;
  playbackRate: number;
  state: 'idle' | 'running' | 'paused' | 'finished';
  animations: TimelineEntry[];
}

export interface TimelineEntry {
  startTime: number;
  animation: AnimationConfig;
  target: string;
  properties: Record<string, [number, number]>;
}

export type EasingFunction =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'easeInQuint'
  | 'easeOutQuint'
  | 'easeInOutQuint'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeInSine'
  | 'easeOutSine'
  | 'easeInOutSine'
  | 'easeInCirc'
  | 'easeOutCirc'
  | 'easeInOutCirc'
  | 'easeInElastic'
  | 'easeOutElastic'
  | 'easeInOutElastic'
  | 'easeInBounce'
  | 'easeOutBounce'
  | 'easeInOutBounce'
  | 'easeInBack'
  | 'easeOutBack'
  | 'easeInOutBack';

export interface GestureAnimation {
  type: 'spring' | 'decay' | 'timing';
  initialVelocity: number;
  target?: number;
  deceleration?: number;
}

// Drag and Drop Types
export interface DragItem {
  id: string;
  type: string;
  data: any;
  sourceId: string;
  index?: number;
}

export interface DropTarget {
  id: string;
  accepts: string[];
  element?: any;
  onDrop?: (item: DragItem, position: DropPosition) => void;
  onHover?: (item: DragItem) => void;
}

export interface DragState {
  isDragging: boolean;
  item: DragItem | null;
  source: string | null;
  position: { x: number; y: number };
  offset: { x: number; y: number };
  overId: string | null;
  dropPosition: DropPosition | null;
}

export interface DropPosition {
  index: number;
  zone: string;
  side: 'before' | 'after' | 'inside';
}

export interface SortableConfig {
  containerId: string;
  items: string[];
  direction: 'vertical' | 'horizontal' | 'grid';
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export interface DropZoneConfig {
  id: string;
  accepts: string[];
  maxFiles?: number;
  maxSize?: number;
  allowedTypes?: string[];
}

// Virtual List Types
export interface VirtualItem {
  index: number;
  offset: number;
  size: number;
  key: string;
  isSticky?: boolean;
}

export interface ScrollState {
  offset: number;
  direction: 'forward' | 'backward';
  isScrolling: boolean;
  velocity: number;
}

export interface VirtualListConfig {
  itemCount: number;
  estimatedItemSize: number;
  overscan?: number;
  getItemKey?: (index: number) => string;
  stickyIndices?: number[];
  horizontal?: boolean;
}

export interface MeasuredItem {
  index: number;
  size: number;
  measured: boolean;
}

// Rich Text Editor Types
export interface EditorState {
  document: EditorNode;
  selection: SelectionState;
  history: EditorHistoryState;
  isComposing: boolean;
}

export interface EditorNode {
  type: NodeType;
  children?: EditorNode[];
  text?: string;
  format?: InlineFormat[];
  attrs?: Record<string, any>;
  id?: string;
}

export type NodeType =
  | 'document'
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'list-item'
  | 'code-block'
  | 'blockquote'
  | 'image'
  | 'embed'
  | 'mention'
  | 'text'
  | 'link'
  | 'divider';

export type InlineFormat = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code';

export interface EditorCommand {
  type: string;
  data?: any;
  inverse?: EditorCommand;
}

export interface SelectionState {
  anchor: CursorPosition;
  focus: CursorPosition;
  isCollapsed: boolean;
}

export interface CursorPosition {
  nodeId: string;
  offset: number;
}

export interface EditorHistoryState {
  undoStack: EditorCommand[];
  redoStack: EditorCommand[];
  maxSize: number;
}

// Date Picker Types
export interface DatePickerState {
  selectedDate: DateValue | null;
  selectedRange: DateRange | null;
  viewDate: DateValue;
  viewMode: 'days' | 'months' | 'years';
  isOpen: boolean;
  timeValue: TimeValue | null;
}

export interface DateValue {
  year: number;
  month: number;
  day: number;
}

export interface TimeValue {
  hours: number;
  minutes: number;
  seconds?: number;
  period?: 'AM' | 'PM';
}

export interface CalendarMonth {
  year: number;
  month: number;
  weeks: CalendarWeek[];
}

export interface CalendarWeek {
  days: CalendarDay[];
}

export interface CalendarDay {
  date: DateValue;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isInRange: boolean;
  isDisabled: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
}

export interface TimeSlot {
  start: TimeValue;
  end: TimeValue;
  available: boolean;
  label?: string;
}

export interface DateRange {
  start: DateValue;
  end: DateValue;
}

export interface TimezoneInfo {
  name: string;
  offset: number;
  abbreviation: string;
  isDST: boolean;
}

export interface DatePickerConfig {
  mode: 'single' | 'range' | 'multiple';
  minDate?: DateValue;
  maxDate?: DateValue;
  disabledDates?: DateValue[];
  disableWeekends?: boolean;
  firstDayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  locale?: string;
  showTime?: boolean;
  use24Hour?: boolean;
  timezone?: string;
}

// Charts Engine Types
export interface ChartConfig {
  type: ChartType;
  width: number;
  height: number;
  padding?: ChartPadding;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  legend?: LegendConfig;
  tooltip?: TooltipConfig;
  animate?: boolean;
}

export interface ChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DataSeries {
  name: string;
  data: DataPoint[];
  color?: string;
  type?: ChartType;
}

export interface DataPoint {
  x: number;
  y: number;
  label?: string;
  meta?: any;
}

export interface AxisConfig {
  label?: string;
  min?: number;
  max?: number;
  tickCount?: number;
  format?: (value: number) => string;
  gridLines?: boolean;
}

export type ChartType = 'line' | 'area' | 'bar' | 'pie' | 'donut' | 'scatter' | 'radar' | 'funnel';

export interface LegendConfig {
  position: 'top' | 'bottom' | 'left' | 'right';
  visible: boolean;
}

export interface TooltipConfig {
  enabled: boolean;
  format?: (point: DataPoint, series: string) => string;
}

// Map Engine Types
export interface MapState {
  center: GeoCoord;
  zoom: number;
  bearing: number;
  pitch: number;
  bounds: MapBounds;
}

export interface MapTile {
  x: number;
  y: number;
  z: number;
  url: string;
  loaded: boolean;
  data?: any;
}

export interface Marker {
  id: string;
  position: GeoCoord;
  icon?: string;
  title?: string;
  data?: any;
  clusterable?: boolean;
}

export interface MarkerCluster {
  id: string;
  center: GeoCoord;
  markers: Marker[];
  count: number;
  bounds: MapBounds;
}

export interface GeoCoord {
  lat: number;
  lng: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface TileCache {
  maxSize: number;
  tiles: Map<string, MapTile>;
  accessOrder: string[];
}

export interface MapConfig {
  center: GeoCoord;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  tileSize?: number;
  tileUrlTemplate?: string;
  clusterRadius?: number;
}

// Infinite Scroll Types
export interface InfiniteScrollState {
  page: number;
  totalItems: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  itemCount: number;
}

export interface IntersectionEntry {
  id: string;
  isIntersecting: boolean;
  ratio: number;
  boundingRect: DOMRectLike;
}

export interface DOMRectLike {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

export interface InfiniteScrollConfig {
  threshold?: number;
  rootMargin?: string;
  initialPage?: number;
  pageSize?: number;
  bidirectional?: boolean;
  debounceMs?: number;
}

// Image Gallery Types
export interface GalleryItem {
  id: string;
  src: string;
  thumbnail?: string;
  alt?: string;
  width: number;
  height: number;
  type?: 'image' | 'video';
}

export interface LightboxState {
  isOpen: boolean;
  currentIndex: number;
  zoom: number;
  panX: number;
  panY: number;
  isTransitioning: boolean;
}

export interface GalleryConfig {
  columns?: number;
  gap?: number;
  layout?: 'grid' | 'masonry';
  enableLightbox?: boolean;
  enableZoom?: boolean;
  preloadCount?: number;
  lazyLoad?: boolean;
}

// Skeleton Loader Types
export interface SkeletonConfig {
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  animate?: boolean;
  animationType?: 'shimmer' | 'pulse';
  speed?: number;
  baseColor?: string;
  highlightColor?: string;
}

export type SkeletonShape = 'rect' | 'circle' | 'text' | 'avatar' | 'button' | 'image';

export interface SkeletonElement {
  shape: SkeletonShape;
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

export interface SkeletonTemplate {
  name: string;
  elements: SkeletonElement[];
  width: number;
  height: number;
}

// Toast System Types
export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  duration?: number;
  action?: ToastAction;
  persistent?: boolean;
  priority?: number;
  timestamp: number;
}

export type ToastPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'bottom-center';

export interface ToastConfig {
  position?: ToastPosition;
  maxVisible?: number;
  defaultDuration?: number;
  gap?: number;
  animationDuration?: number;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastState {
  id: string;
  phase: 'entering' | 'visible' | 'exiting' | 'removed';
  offset: number;
}

// Command Palette Types
export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon?: string;
  action: () => void;
  category?: string;
  keywords?: string[];
  children?: CommandItem[];
  disabled?: boolean;
}

export interface CommandGroup {
  id: string;
  label: string;
  commands: CommandItem[];
  priority?: number;
}

export interface CommandPaletteConfig {
  inputHint?: string;
  maxResults?: number;
  recentCount?: number;
  groups?: CommandGroup[];
  contextFilter?: (command: CommandItem) => boolean;
}

export interface CommandSearchResult {
  item: CommandItem;
  score: number;
  matches: MatchRange[];
}

export interface MatchRange {
  start: number;
  end: number;
}

// Keyboard Shortcuts Types
export interface ShortcutBinding {
  id: string;
  combo: ShortcutCombo;
  handler: () => void;
  scope?: string;
  description?: string;
  enabled?: boolean;
  preventDefault?: boolean;
}

export interface ShortcutScope {
  id: string;
  label: string;
  active: boolean;
  parent?: string;
  bindings: ShortcutBinding[];
}

export interface ShortcutCombo {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

export interface ShortcutSequence {
  id: string;
  combos: ShortcutCombo[];
  handler: () => void;
  timeout?: number;
  scope?: string;
}

// Responsive System Types
export interface Breakpoint {
  name: string;
  minWidth: number;
  maxWidth?: number;
}

export interface BreakpointConfig {
  breakpoints: Breakpoint[];
  defaultBreakpoint?: string;
}

export interface MediaQueryResult {
  matches: boolean;
  query: string;
}

export interface ResponsiveValue<T = any> {
  xs?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  '2xl'?: T;
}

export interface ViewportInfo {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  breakpoint: string;
  safeAreaInsets: SafeAreaInsets;
}

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Theme Engine Types
export interface ThemeConfig {
  name: string;
  mode: 'light' | 'dark' | 'high-contrast';
  tokens: ThemeToken[];
  colorPalette: ColorPalette;
  spacing: SpacingScale;
  typography: TypographyScale;
  components?: Record<string, Record<string, string>>;
}

export interface ThemeToken {
  name: string;
  value: string;
  category: 'color' | 'spacing' | 'typography' | 'border' | 'shadow' | 'motion';
  description?: string;
}

export interface ColorPalette {
  primary: ColorScale;
  secondary: ColorScale;
  neutral: ColorScale;
  success: ColorScale;
  warning: ColorScale;
  error: ColorScale;
  info: ColorScale;
}

export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

export type ContrastMode = 'AA' | 'AAA';

export interface SpacingScale {
  base: number;
  scale: number[];
}

export interface TypographyScale {
  baseFontSize: number;
  scaleRatio: number;
  fontFamilies: Record<string, string>;
  weights: Record<string, number>;
  lineHeights: Record<string, number>;
}

export interface ThemeTransition {
  property: string;
  duration: number;
  easing: string;
}
