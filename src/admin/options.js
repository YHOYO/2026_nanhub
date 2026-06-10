import AdminJS from 'adminjs';
import { ComponentLoader } from 'adminjs';
// Side-effect import: registers SqliteDatabase + SqliteResource
// with AdminJS.registerAdapter() so the ResourcesFactory can
// match raw model objects to our custom adapter.
import './database-adapter.js';

import Request from '../models/Request.js';
import Project from '../models/Project.js';
import ApiKey from '../models/ApiKey.js';
import Metric from '../models/Metric.js';
import { generateId } from '../utils/encryption.js';

// Component loader for custom components
export const componentLoader = new ComponentLoader();

// Register custom components
componentLoader.add('ApiKeysPage', './components/ApiKeysRedirect.jsx');
componentLoader.add('MetricsDashboard', './components/MetricsDashboard.jsx');
componentLoader.add('ImageGenerator', './components/ImageGenerator.jsx');

// AdminJS configuration
const adminOptions = {
  // Root path
  rootPath: '/admin',
  
  // Pass the component loader to AdminJS
  componentLoader,

  // Navigation structure
  navigation: {
    defaultIcon: 'Folder',
    items: [
      {
        name: 'Dashboard',
        icon: 'Dashboard',
      },
      {
        name: 'Projects',
        icon: 'Package',
        resource: 'projects',
      },
      {
        name: 'Requests',
        icon: 'List',
        resource: 'requests',
      },
      {
        name: 'Analytics',
        icon: 'BarChart',
        page: 'metrics',
      },
      {
        name: 'Image Generator',
        icon: 'Image',
        page: 'image-generator',
      },
    ],
  },

  // Database resources
  resources: [
    {
      resource: Request,
      options: {
        id: 'requests',
        properties: {
          id: { isHidden: true },
          method: { isRequired: true },
          endpoint: { isRequired: true },
          api_key_hash: { isHidden: true },
          client_ip: { isHidden: true },
          user_agent: { isHidden: true },
          request_body: { type: 'textarea', isHidden: true },
          response_status: { type: 'number' },
          response_body: { type: 'textarea', isHidden: true },
          response_time_ms: { type: 'number' },
          tokens_prompt: { type: 'number' },
          tokens_completion: { type: 'number' },
          tokens_total: { type: 'number' },
          model: { type: 'string' },
          project_id: { isHidden: true },
          error_message: { type: 'textarea' },
          created_at: { type: 'datetime' },
        },
        list: {
          sortBy: 'created_at',
          sortOrder: 'desc',
          visibleProperties: ['id', 'method', 'endpoint', 'model', 'response_status', 'response_time_ms', 'tokens_total', 'created_at'],
        },
        show: {
          visibleProperties: ['id', 'method', 'endpoint', 'model', 'response_status', 'response_time_ms', 'tokens_prompt', 'tokens_completion', 'tokens_total', 'error_message', 'request_body', 'response_body', 'created_at'],
        },
      },
    },
    {
      resource: Project,
      options: {
        id: 'projects',
        properties: {
          id: {
            isHidden: true,
            isVisible: { list: false, show: false, edit: false, filter: false },
          },
          name: {
            isRequired: true,
            isVisible: { list: true, show: true, edit: true, filter: true },
          },
          description: {
            type: 'textarea',
            isVisible: { list: false, show: true, edit: true, filter: false },
          },
          api_key_hash: {
            isHidden: true,
            isVisible: { list: false, show: false, edit: false, filter: false },
          },
          is_active: {
            type: 'boolean',
            isVisible: { list: true, show: true, edit: true, filter: true },
          },
          created_at: {
            type: 'datetime',
            isVisible: { list: true, show: true, edit: false, filter: true },
          },
          updated_at: {
            type: 'datetime',
            isVisible: { list: false, show: true, edit: false, filter: false },
          },
        },
        list: {
          visibleProperties: ['name', 'is_active', 'created_at'],
          sortBy: 'created_at',
          sortOrder: 'desc',
        },
        show: {
          visibleProperties: ['name', 'description', 'is_active', 'created_at', 'updated_at'],
        },
        edit: {
          visibleProperties: ['name', 'description', 'is_active'],
        },
        actions: {
          new: {
            before: async (request) => {
              if (request.payload) {
                request.payload.id = generateId();
                // API keys are now managed separately via ProjectApiKey model
              }
              return request;
            },
            after: async (response) => {
              return response;
            },
          },
        },
      },
    },
    // Hidden resource - not shown in sidebar navigation
    // Used internally for API key management
    {
      resource: ApiKey,
      options: {
        id: 'api-keys',
        navigation: false,
        properties: {
          id: {
            isHidden: true,
            isVisible: { list: false, show: false, edit: false, filter: false },
          },
          key_hash: {
            isHidden: true,
            isVisible: { list: false, show: false, edit: false, filter: false },
          },
          name: {
            isRequired: true,
            isVisible: { list: true, show: true, edit: true, filter: true },
          },
          project_id: {
            isHidden: true,
            isVisible: { list: false, show: true, edit: false, filter: false },
          },
          permissions: {
            type: 'textarea',
            isHidden: true,
            isVisible: { list: false, show: false, edit: false, filter: false },
          },
          last_used_at: {
            type: 'datetime',
            isVisible: { list: true, show: true, edit: false, filter: true },
          },
          expires_at: {
            type: 'datetime',
            isHidden: true,
            isVisible: { list: false, show: true, edit: false, filter: false },
          },
          is_active: {
            type: 'boolean',
            isVisible: { list: true, show: true, edit: true, filter: true },
          },
          created_at: {
            type: 'datetime',
            isVisible: { list: true, show: true, edit: false, filter: true },
          },
        },
        list: {
          visibleProperties: ['name', 'is_active', 'last_used_at', 'created_at'],
          sortBy: 'created_at',
          sortOrder: 'desc',
        },
        show: {
          visibleProperties: ['name', 'is_active', 'last_used_at', 'expires_at', 'created_at'],
        },
        edit: {
          visibleProperties: ['name', 'is_active'],
        },
        actions: {
          new: {
            before: async (request) => {
              if (request.payload) {
                request.payload.id = generateId();
                const apiKey = generateApiKey();
                request.payload.key_hash = hashApiKey(apiKey);
              }
              return request;
            },
          },
        },
      },
    },
    {
      resource: Metric,
      options: {
        id: 'metrics',
        properties: {
          id: { isHidden: true },
          date: { type: 'date', isRequired: true },
          project_id: { isHidden: true },
          model: { type: 'string' },
          total_requests: { type: 'number' },
          total_tokens: { type: 'number' },
          avg_response_time_ms: { type: 'number' },
          error_rate: { type: 'number' },
          created_at: { type: 'datetime' },
        },
        list: {
          visibleProperties: ['date', 'model', 'total_requests', 'total_tokens', 'avg_response_time_ms', 'error_rate'],
          sortBy: 'date',
          sortOrder: 'desc',
        },
      },
    },
  ],

  // Dashboard as home page (replaces "Welcome on Board!")
  dashboard: {
    component: 'MetricsDashboard',
  },

  // Custom pages
  pages: {
    'api-keys': {
      component: 'ApiKeysPage',
      icon: 'Key',
    },
    'metrics': {
      component: 'MetricsDashboard',
      icon: 'BarChart',
    },
    'image-generator': {
      component: 'ImageGenerator',
      icon: 'Image',
    },
  },

  // Branding
  branding: {
    companyName: 'NaNProxy',
    logo: false,
    theme: {
      colors: {
        primary100: '#3B82F6',
        primary80: '#60A5FA',
        primary60: '#93C5FD',
        primary40: '#BFDBFE',
        primary20: '#DBEAFE',
        neutral100: '#111827',
        neutral90: '#1F2937',
        neutral80: '#374151',
        neutral70: '#4B5563',
        neutral60: '#6B7280',
        neutral50: '#9CA3AF',
        neutral40: '#D1D5DB',
        neutral30: '#E5E7EB',
        neutral20: '#F3F4F6',
        neutral10: '#F9FAFB',
        success: '#10B981',
        successDark: '#059669',
        info: '#3B82F6',
        infoDark: '#2563EB',
        danger: '#EF4444',
        dangerDark: '#DC2626',
        warning: '#F59E0B',
        warningDark: '#D97706',
      },
    },
  },

  // Assets
  assets: {
    styles: [],
    scripts: [],
  },
};

export default adminOptions;
