import type { ToolDefinition } from '../types.js';

export const mapsTools: ToolDefinition[] = [
  {
    id: 'quantmaps.search',
    appId: 'quantmaps',
    name: 'Search Places',
    description: 'Search for places, businesses, or addresses on the map',
    inputSchema: {
      query: { type: 'string', required: true, description: 'Place search query' },
      near: { type: 'string', required: false, description: 'Location to search near' },
      radius: {
        type: 'number',
        required: false,
        description: 'Search radius in meters',
        default: 5000,
      },
    },
    outputSchema: {
      type: 'array',
      description: 'Matching places',
      fields: {
        placeId: { type: 'string', description: 'Place ID' },
        name: { type: 'string', description: 'Place name' },
        address: { type: 'string', description: 'Full address' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['maps', 'search', 'places'],
  },
  {
    id: 'quantmaps.directions',
    appId: 'quantmaps',
    name: 'Get Directions',
    description: 'Get directions between two locations',
    inputSchema: {
      origin: { type: 'string', required: true, description: 'Starting location' },
      destination: { type: 'string', required: true, description: 'Destination location' },
      mode: {
        type: 'string',
        required: false,
        description: 'Travel mode (driving, walking, transit, cycling)',
        default: 'driving',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Directions result',
      fields: {
        distance: { type: 'string', description: 'Total distance' },
        duration: { type: 'string', description: 'Estimated duration' },
        steps: { type: 'array', description: 'Navigation steps' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['maps', 'directions', 'navigation'],
  },
  {
    id: 'quantmaps.share-location',
    appId: 'quantmaps',
    name: 'Share Location',
    description: 'Share your current location with other users',
    inputSchema: {
      recipients: { type: 'array', required: true, description: 'User IDs to share with' },
      duration: {
        type: 'number',
        required: false,
        description: 'Share duration in minutes',
        default: 60,
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Share result',
      fields: {
        success: { type: 'boolean', description: 'Whether sharing started' },
        shareId: { type: 'string', description: 'Share session ID' },
        expiresAt: { type: 'number', description: 'Expiration timestamp' },
      },
    },
    permissionTier: 2,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['maps', 'share', 'location'],
  },
  {
    id: 'quantmaps.save-place',
    appId: 'quantmaps',
    name: 'Save Place',
    description: 'Save a place to your favorites list',
    inputSchema: {
      placeId: { type: 'string', required: true, description: 'Place ID to save' },
      listName: {
        type: 'string',
        required: false,
        description: 'List to save to',
        default: 'favorites',
      },
      note: { type: 'string', required: false, description: 'Personal note about the place' },
    },
    outputSchema: {
      type: 'object',
      description: 'Save result',
      fields: {
        success: { type: 'boolean', description: 'Whether place was saved' },
        savedAt: { type: 'number', description: 'Save timestamp' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['maps', 'save', 'favorites'],
  },
  {
    id: 'quantmaps.distance',
    appId: 'quantmaps',
    name: 'Calculate Distance',
    description: 'Calculate distance between two or more points',
    inputSchema: {
      points: {
        type: 'array',
        required: true,
        description: 'Array of location strings or coordinates',
      },
      unit: {
        type: 'string',
        required: false,
        description: 'Distance unit (km, miles)',
        default: 'km',
      },
    },
    outputSchema: {
      type: 'object',
      description: 'Distance calculation result',
      fields: {
        totalDistance: { type: 'number', description: 'Total distance in specified unit' },
        segments: { type: 'array', description: 'Distance between each pair of points' },
      },
    },
    permissionTier: 0,
    costEstimate: 'free',
    undoRecipe: null,
    tags: ['maps', 'distance', 'calculate'],
  },
];
