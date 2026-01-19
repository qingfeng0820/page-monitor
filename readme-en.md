# Simple Website Traffic Monitoring System - PageMonitor
* Simple environment setup and deployment
* Website traffic data is stored in MongoDB
* Can view website visits, stay time, download statistics for resources on the website, and custom event statistics

## Install MongoDB
* Pull MongoDB image `docker pull mongo`
* Run MongoDB
  ```shell
  docker run -d --name mongodb \
    -p 27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME=admin \
    -e MONGO_INITDB_ROOT_PASSWORD=myadminsecret123 \
    -v ./mongodb_data:/data/db \
    -d mongo:latest
  ```
* Create MongoDB user for PageMonitor
  ```shell
  docker exec -it mongodb mongosh -u admin -p myadminsecret123 --authenticationDatabase admin
  # mongosh "mongodb://admin:secret123@localhost:27017/admin?authSource=admin"

  # in mongo shell
  use admin
  db.createUser({
    user: 'monitor_admin',
    pwd: 'test123',
    roles: [ { role: 'readWrite', db: 'page_monitor' } ]
  })

  # application will use mongodb://monitor_admin:test123@localhost:27017/
  ```

## Build and Install PageMonitor
* Steps
  1. Build PageMonitor image
    ```shell
    sudo docker build -t simple-track .

    # Export image
    sudo docker save simple-track > simple-track.tar.gz

    # Import on target machine
    sudo docker load -i simple-track.tar.gz
    ```
  2. Run PageMonitor container
    ```shell
    sudo docker run -d --name simple-track \
      -p 8000:8000 \
      -e MONGO_DB_CONN_STR="mongodb://monitor_admin:test123@localhost:27017/" \
      simple-track
    ```
* Use `deploy.sh` script for automatic build and deployment
  ```shell
  # Create .env file in the script directory, refer to .env.example to configure .env
  # Run deployment script
  ./deploy.sh
  # On Ubuntu, sudo permission is required
  sudo ./deploy.sh
  ```

## Monitor Websites with PageMonitor
1. Access `<monitor-server-address>/register.html` to register a user
2. Log in to PageMonitor with the registered username and password
3. Create a website to monitor
   ![Create Website to Monitor](doc/img/add_site.png)
4. After successful creation, you can see the list of monitored websites
   ![Monitored Website List](doc/img/site_list.png)
4. Follow the instructions to add the monitoring script pagemonitor.min.js to the HTML file of the website to be monitored
5. Click `View Monitoring Data` on the corresponding website card to view website monitoring data
   ![View Monitoring Data](doc/img/site_data.png)

## Monitoring Script Usage Instructions

### Basic Usage
```html
<script src="<monitor-server-address>/public/pagemonitor.min.js" data-system="System Name" data-api-key="API Key"></script>
```

### autoInitialize Feature
The script will automatically initialize monitoring functionality by default, no additional configuration is required. If you need to disable automatic initialization, you can use the following attribute:
```html
<script src="<monitor-server-address>/public/pagemonitor.min.js" data-auto-init="false"></script>
```

### Supported data-xxx Attributes
- **data-system**: System name (required)
- **data-api-key**: API key (required)
- **data-api-base-url**: API base URL (default: /api)
- **data-is-spa**: Whether it is a SPA application (true/false, default: false)
- **data-is-track-downloads**: Whether to track downloads (true/false, default: true)
- **data-max-pending-items**: Maximum number of pending records (default: 50)
- **data-log-level**: Log level (debug/info/warn/error, default: warn)
- **data-custom-events**: Custom event configuration (JSON format)
- **data-active-time-threshold**: Active time threshold (seconds, default: 600 seconds) - used to calculate stay time

### Custom Event Configuration
You can configure custom event monitoring through the data-custom-events attribute:
```html
<script src="<monitor-server-address>/public/pagemonitor.min.js" 
    data-system="System Name" 
    data-api-key="API Key" 
    data-custom-events='[
        {
            "selector": ".btn", 
            "eventType": "click", 
            "properties": {
                "category": "button",
                "action": "click",
                "label": "Button Click"
            }
        },
        {
            "selector": "#login-form", 
            "eventType": "submit", 
            "properties": {
                "category": "form",
                "action": "submit",
                "label": "Login Form Submit"
            }
        }
    ]'></script>
```

**Configuration Description:**
- **selector**: CSS selector used to match elements to be monitored
- **eventType**: Event type (default: click)
- **properties**: Custom event properties, including:
  - category: Event category
  - action: Event action
  - label: Event label

### Manual Initialization (When autoInitialize is disabled)
```html
<script src="<monitor-server-address>/public/pagemonitor.min.js" data-auto-init="false"></script>
<script>
    // Wait for DOM to load
    document.addEventListener('DOMContentLoaded', function() {
        // Create monitoring instance
        if (typeof window.PageMonitor !== 'undefined') {
            window.pageMonitorInstance = new window.PageMonitor({
                system: 'System Name',
                apiKey: 'API Key',
                isSPA: false,
                isTrackDownloads: true,
                activeTimeThreshold: 600, // Active time threshold (seconds) - 10 minutes
                customEvents: [
                    {
                        selector: '.btn',
                        eventType: 'click',
                        properties: {
                            category: 'button',
                            action: 'click'
                        }
                    }
                ]
            });
        } else {
            console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
        }
    });
</script>
```

### Vue Integration Methods
There are two ways to add pagemonitor.js to a Vue project: global import and component-level import. The following introduces the integration methods for Vue 2 and Vue 3 respectively.

#### Vue 2 Integration

##### Global Import (in main.js)
Need to download pagemonitor.min.js first.
```javascript
// Import pagemonitor.js
import './path/to/pagemonitor.min.js';

// TypeScript type declaration (needed in TypeScript environment)
/*
interface PageMonitorOptions {
  system: string;
  apiKey: string;
  apiBaseUrl?: string;
  isSPA?: boolean;
  isTrackDownloads?: boolean;
  maxPendingItems?: number;
  activeTimeThreshold?: number;
}

declare global {
  interface Window {
    PageMonitor?: new (options: PageMonitorOptions) => any;
    pageMonitorInstance?: any;
  }
}
*/

// Initialize after Vue instance is mounted
new Vue({
  el: '#app',
  mounted() {
    // Ensure DOM has loaded
    this.$nextTick(() => {
      // Ensure accessing PageMonitor class through window object
      if (typeof window.PageMonitor !== 'undefined') {
        window.pageMonitorInstance = new window.PageMonitor({
          system: 'Vue 2 System Name',
          apiKey: 'API Key',
          apiBaseUrl: '<monitor-server-address>/api', // Explicitly specify API address
          isSPA: true, // Vue is usually a SPA application
          isTrackDownloads: true
        });
      } else {
        console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
      }
    });
  }
});
```

##### Component-level Import
```html
<template>
  <div>Vue 2 Component</div>
</template>

<script>
// TypeScript type declaration (needed in TypeScript environment)
/*
interface PageMonitorOptions {
  system: string;
  apiKey: string;
  apiBaseUrl?: string;
  isSPA?: boolean;
  isTrackDownloads?: boolean;
  maxPendingItems?: number;
  activeTimeThreshold?: number;
}

declare global {
  interface Window {
    PageMonitor?: new (options: PageMonitorOptions) => any;
    pageMonitorInstance?: any;
    _pageMonitorScript?: HTMLScriptElement;
  }
}
*/

export default {
  name: 'YourComponent',
  mounted() {
    // Dynamically load pagemonitor.js
    const script = document.createElement('script');
    script.src = '<monitor-server-address>/public/pagemonitor.min.js';
    script.onload = () => {
      // Ensure accessing PageMonitor class through window object
      if (typeof window.PageMonitor !== 'undefined') {
        window.pageMonitorInstance = new window.PageMonitor({
          system: 'Vue 2 Component System',
          apiKey: 'API Key',
          isSPA: true
        });
      } else {
        console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
      }
    };
    script.onerror = () => {
      console.error('Failed to load pagemonitor.js script.');
    };
    document.body.appendChild(script);
    // Save script element to component instance for access in beforeDestroy
    this.pageMonitorScript = script;
  },
  beforeDestroy() {
    // Cleanup before component destruction
    if (window.pageMonitorInstance) {
      window.pageMonitorInstance.destroy();
      delete window.pageMonitorInstance;
    }
    // Remove dynamically created script element
    if (this.pageMonitorScript) {
      document.body.removeChild(this.pageMonitorScript);
    }
  }
}
</script>
```

#### Vue 3 Integration

##### Global Import (in main.js)
Need to download pagemonitor.min.js first.
```javascript
// Import pagemonitor.js
import './path/to/pagemonitor.min.js';
import { createApp } from 'vue';
import App from './App.vue';

// TypeScript type declaration (needed in TypeScript environment)
/*
interface PageMonitorOptions {
  system: string;
  apiKey: string;
  apiBaseUrl?: string;
  isSPA?: boolean;
  isTrackDownloads?: boolean;
  maxPendingItems?: number;
  activeTimeThreshold?: number;
}

declare global {
  interface Window {
    PageMonitor?: new (options: PageMonitorOptions) => any;
    pageMonitorInstance?: any;
  }
}
*/

const app = createApp(App);
app.mount('#app');

// Initialize monitoring after app is mounted
if (typeof window.PageMonitor !== 'undefined') {
  window.pageMonitorInstance = new window.PageMonitor({
    system: 'Vue 3 System Name',
    apiKey: 'API Key',
    apiBaseUrl: '<monitor-server-address>/api', // Explicitly specify API address
    isSPA: true, // Vue 3 is usually a SPA application
    isTrackDownloads: true
  });
} else {
  console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
}
```

##### Component-level Import
```html
<template>
  <div>Vue 3 Component</div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

// TypeScript type declaration (needed in TypeScript environment)
/*
interface PageMonitorOptions {
  system: string;
  apiKey: string;
  apiBaseUrl?: string;
  isSPA?: boolean;
  isTrackDownloads?: boolean;
  maxPendingItems?: number;
  activeTimeThreshold?: number;
}

declare global {
  interface Window {
    PageMonitor?: new (options: PageMonitorOptions) => any;
    pageMonitorInstance?: any;
    _pageMonitorScript?: HTMLScriptElement;
  }
}
*/

onMounted(() => {
  // Dynamically load pagemonitor.js
  const script = document.createElement('script');
  script.src = '<monitor-server-address>/public/pagemonitor.min.js';
  script.onload = () => {
    // Ensure accessing PageMonitor class through window object
    if (typeof window.PageMonitor !== 'undefined') {
      window.pageMonitorInstance = new window.PageMonitor({
        system: 'Vue 3 Component System',
        apiKey: 'API Key',
        isSPA: true
      });
    } else {
      console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
    }
  };
  script.onerror = () => {
    console.error('Failed to load pagemonitor.js script.');
  };
  document.body.appendChild(script);
  // Save script element to window object for access in onUnmounted
  window._pageMonitorScript = script;
});

onUnmounted(() => {
  // Cleanup before component destruction
  if (window.pageMonitorInstance) {
    window.pageMonitorInstance.destroy();
    delete window.pageMonitorInstance;
  }
  // Remove dynamically created script element
  if (window._pageMonitorScript) {
    document.body.removeChild(window._pageMonitorScript);
    delete window._pageMonitorScript;
  }
});
</script>
```

### React Integration Methods
There are two ways to add pagemonitor.js to a React project: global import and component-level import.

#### Global Import (in index.js)
Need to download pagemonitor.min.js first.
```javascript
// Import pagemonitor.js
import './path/to/pagemonitor.min.js';

// TypeScript type declaration (needed in TypeScript environment)
/*
interface PageMonitorOptions {
  system: string;
  apiKey: string;
  apiBaseUrl?: string;
  isSPA?: boolean;
  isTrackDownloads?: boolean;
  maxPendingItems?: number;
  activeTimeThreshold?: number;
}

declare global {
  interface Window {
    PageMonitor?: new (options: PageMonitorOptions) => any;
    pageMonitorInstance?: any;
  }
}
*/

// Initialize after app is rendered
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Initialize monitoring
if (typeof window.PageMonitor !== 'undefined') {
  window.pageMonitorInstance = new window.PageMonitor({
    system: 'React System Name',
    apiKey: 'API Key',
    apiBaseUrl: '<monitor-server-address>/api', // Explicitly specify API address
    isSPA: true, // React is usually a SPA application
    isTrackDownloads: true
  });
} else {
  console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
}
```

#### Component-level Import
```javascript
import React, { useEffect } from 'react';

// TypeScript type declaration (needed in TypeScript environment)
/*
interface PageMonitorOptions {
  system: string;
  apiKey: string;
  isSPA: boolean;
  isTrackDownloads: boolean;
}

declare global {
  interface Window {
    pageMonitorInstance?: any;
    _pageMonitorScript?: HTMLScriptElement;
  }
  var PageMonitor: new (options: PageMonitorOptions) => any;
}
*/

function App() {
  useEffect(() => {
    // Dynamically load and initialize pagemonitor.js
    const script = document.createElement('script');
    script.src = '<monitor-server-address>/public/pagemonitor.min.js';
    script.onload = () => {
      // Ensure accessing PageMonitor class through window object
      if (typeof window.PageMonitor !== 'undefined') {
        window.pageMonitorInstance = new window.PageMonitor({
          system: 'React Application',
          apiKey: 'API Key',
          isSPA: true
        });
      } else {
        console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
      }
    };
    script.onerror = () => {
      console.error('Failed to load pagemonitor.js script.');
    };
    document.body.appendChild(script);
    
    // Save script element to window object for access during cleanup
    window._pageMonitorScript = script;
    
    return () => {
      // Cleanup
      if (window.pageMonitorInstance && typeof window.pageMonitorInstance.destroy === 'function') {
        window.pageMonitorInstance.destroy();
        delete window.pageMonitorInstance;
      }
      // Remove script element
      if (window._pageMonitorScript) {
        document.body.removeChild(window._pageMonitorScript);
        delete window._pageMonitorScript;
      }
    };
  }, []);
  
  return <div>React Application</div>;
}

export default App;
```