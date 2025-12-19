# 简单的网站流量监控系统 PageMonitor
* 环境安装以及部署简单
* 监控网站流量数据存储在Monggodb中
* 能查看网站的访问量、停留时间，网站上下载资源的下载量，以及网站上自定义事件的统计

## 安装Monggodb
* 拉取Monggodb镜像 `docker pull mongo`
* 运行Monggodb
  ```shell
  docker run -d --name mongodb \
    -p 27017:27017 \
    -e MONGO_INITDB_ROOT_USERNAME=admin \
    -e MONGO_INITDB_ROOT_PASSWORD=myadminsecret123 \
    -v ./mongodb_data:/data/db \
    -d mongo:latest
  ```
* 为PageMonitor创建Monggodb用户
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

## 构建和安装PageMonitor
1. 构建PageMonitor镜像
  ```shell
  sudo docker build -t simple-track .

  # 导出image
  docker save simple-track > simple-track.tar.gz

  # 在目标机器上导入
  docker load -i simple-track.tar.gz
  ```
2. 运行PageMonitor容器
  ```shell
  sudo docker run -d --name simple-track \
    -p 8000:8000 \
    -e MONGO_DB_CONN_STR="mongodb://monitor_admin:test123@localhost:27017/" \
    simple-track
  ```

## 用PageMonitor监控网站
1. 内网访问 `<monitor-server-address>/register.html`注册用户
2. 用注册的用户名密码登录PageMonitor
3. 创建要监控网站
   ![创建要监控网站](doc/img/add_site.png)
4. 创建成功后可以看到监控网站的卡片列表
   ![监控网站列表](doc/img/site_list.png)
4. 按照说明，添加监控脚本pagemonitor.min.js到要监控网站的HTML文件中
5. 点击 对应网站卡片上的`查看监控数据` ，即可查看网站监控数据
   ![查看监控数据](doc/img/site_data.png)

## 监控脚本使用说明

### 基本用法
```html
<script src="<monitor-server-address>/public/pagemonitor.min.js" data-system="系统名称" data-api-key="API密钥"></script>
```

### autoInitialize 功能
脚本默认会自动初始化监控功能，无需额外配置。如果需要禁用自动初始化，可以使用以下属性：
```html
<script src="<monitor-server-address>/public/pagemonitor.min.js" data-auto-init="false"></script>
```

### 支持的 data-xxx 属性
- **data-system**: 系统名称（必填）
- **data-api-key**: API密钥（必填）
- **data-api-base-url**: API基础URL（默认：/api）
- **data-is-spa**: 是否为SPA应用（true/false，默认：false）
- **data-is-track-downloads**: 是否跟踪下载（true/false，默认：true）
- **data-max-pending-items**: 最大待处理记录数（默认：50）
- **data-log-level**: 日志级别（debug/info/warn/error，默认：warn）
- **data-custom-events**: 自定义事件配置（JSON格式）
- **data-active-time-threshold**: 活跃时间阈值（秒，默认：600秒） - 用于计算停留时间

### 自定义事件配置
可以通过 data-custom-events 属性配置自定义事件监控：
```html
<script src="<monitor-server-address>/public/pagemonitor.min.js" 
    data-system="系统名称" 
    data-api-key="API密钥" 
    data-custom-events='[
        {
            "selector": ".btn", 
            "eventType": "click", 
            "properties": {
                "category": "button",
                "action": "click",
                "label": "按钮点击"
            }
        },
        {
            "selector": "#login-form", 
            "eventType": "submit", 
            "properties": {
                "category": "form",
                "action": "submit",
                "label": "登录表单提交"
            }
        }
    ]'></script>
```

**配置说明：**
- **selector**: CSS选择器，用于匹配要监控的元素
- **eventType**: 事件类型（默认：click）
- **properties**: 自定义事件属性，包含：
  - category: 事件类别
  - action: 事件动作
  - label: 事件标签

### 手动初始化（当禁用autoInitialize时）
```html
<script src="<monitor-server-address>/public/pagemonitor.min.js" data-auto-init="false"></script>
<script>
    // 等待DOM加载完成
    document.addEventListener('DOMContentLoaded', function() {
        // 创建监控实例
        if (typeof window.PageMonitor !== 'undefined') {
            window.pageMonitorInstance = new window.PageMonitor({
                system: '系统名称',
                apiKey: 'API密钥',
                isSPA: false,
                isTrackDownloads: true,
                activeTimeThreshold: 600, // 活跃时间阈值（秒） 即10分钟
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

### Vue 集成方法
将 pagemonitor.js 添加到 Vue 项目中有两种方式：全局引入和组件级引入。以下分别介绍 Vue 2 和 Vue 3 的集成方法。

#### Vue 2 集成

##### 全局引入（在 main.js 中）
需要先下载 pagemonitor.min.js。
```javascript
// 引入 pagemonitor.js
import './path/to/pagemonitor.min.js';

// TypeScript类型声明（在TypeScript环境下需要放开下面的类型声明注释）
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

// 在 Vue 实例挂载后初始化
new Vue({
  el: '#app',
  mounted() {
    // 确保 DOM 已加载完成
    this.$nextTick(() => {
      // 确保通过window对象访问PageMonitor类
      if (typeof window.PageMonitor !== 'undefined') {
        window.pageMonitorInstance = new window.PageMonitor({
          system: 'Vue 2 系统名称',
          apiKey: 'API密钥',
          apiBaseUrl: '<monitor-server-address>/api', // 显式指定API地址
          isSPA: true, // Vue 通常是 SPA 应用
          isTrackDownloads: true
        });
      } else {
        console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
      }
    });
  }
});
```

##### 组件级引入
```html
<template>
  <div>Vue 2 组件</div>
</template>

<script>
// TypeScript类型声明（在TypeScript环境下需要放开下面的类型声明注释）
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
    // 动态加载 pagemonitor.js
    const script = document.createElement('script');
    script.src = '<monitor-server-address>/public/pagemonitor.min.js';
    script.onload = () => {
      // 确保通过window对象访问PageMonitor类
      if (typeof window.PageMonitor !== 'undefined') {
        window.pageMonitorInstance = new window.PageMonitor({
          system: 'Vue 2 组件系统',
          apiKey: 'API密钥',
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
    // 将script元素保存到组件实例，以便在beforeDestroy中访问
    this.pageMonitorScript = script;
  },
  beforeDestroy() {
    // 组件销毁前的清理工作
    if (window.pageMonitorInstance) {
      window.pageMonitorInstance.destroy();
      delete window.pageMonitorInstance;
    }
    // 移除动态创建的script元素
    if (this.pageMonitorScript) {
      document.body.removeChild(this.pageMonitorScript);
    }
  }
}
</script>
```

#### Vue 3 集成

##### 全局引入（在 main.js 中）
需要先下载 pagemonitor.min.js。
```javascript
// 引入 pagemonitor.js
import './path/to/pagemonitor.min.js';
import { createApp } from 'vue';
import App from './App.vue';

// TypeScript类型声明（在TypeScript环境下需要放开下面的类型声明注释）
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

// 应用挂载后初始化监控
if (typeof window.PageMonitor !== 'undefined') {
  window.pageMonitorInstance = new window.PageMonitor({
    system: 'Vue 3 系统名称',
    apiKey: 'API密钥',
    apiBaseUrl: '<monitor-server-address>/api', // 显式指定API地址
    isSPA: true, // Vue 3 通常是 SPA 应用
    isTrackDownloads: true
  });
} else {
  console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
}
```

##### 组件级引入
```html
<template>
  <div>Vue 3 组件</div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue';

// TypeScript类型声明（在TypeScript环境下需要放开下面的类型声明注释）
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
  // 动态加载 pagemonitor.js
  const script = document.createElement('script');
  script.src = '<monitor-server-address>/public/pagemonitor.min.js';
  script.onload = () => {
    // 确保通过window对象访问PageMonitor类
    if (typeof window.PageMonitor !== 'undefined') {
      window.pageMonitorInstance = new window.PageMonitor({
        system: 'Vue 3 组件系统',
        apiKey: 'API密钥',
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
  // 将script元素保存到window对象，以便在onUnmounted中访问
  window._pageMonitorScript = script;
});

onUnmounted(() => {
  // 组件销毁前的清理工作
  if (window.pageMonitorInstance) {
    window.pageMonitorInstance.destroy();
    delete window.pageMonitorInstance;
  }
  // 移除动态创建的script元素
  if (window._pageMonitorScript) {
    document.body.removeChild(window._pageMonitorScript);
    delete window._pageMonitorScript;
  }
});
</script>
```

### React 集成方法
将 pagemonitor.js 添加到 React 项目中有两种方式：全局引入和组件级引入。

#### 全局引入（在 index.js 中）
需要先下载 pagemonitor.min.js。
```javascript
// 引入 pagemonitor.js
import './path/to/pagemonitor.min.js';

// TypeScript类型声明（在TypeScript环境下需要放开下面的类型声明注释）
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

// 在应用渲染后初始化
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// 初始化监控
if (typeof window.PageMonitor !== 'undefined') {
  window.pageMonitorInstance = new window.PageMonitor({
    system: 'React 系统名称',
    apiKey: 'API密钥',
    apiBaseUrl: '<monitor-server-address>/api', // 显式指定API地址
    isSPA: true, // React 通常是 SPA 应用
    isTrackDownloads: true
  });
} else {
  console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
}
```

#### 组件级引入
```javascript
import React, { useEffect } from 'react';

// TypeScript类型声明（在TypeScript环境下需要放开下面的类型声明注释）
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
    // 动态加载并初始化 pagemonitor.js
    const script = document.createElement('script');
    script.src = '<monitor-server-address>/public/pagemonitor.min.js';
    script.onload = () => {
      // 确保通过window对象访问PageMonitor类
      if (typeof window.PageMonitor !== 'undefined') {
        window.pageMonitorInstance = new window.PageMonitor({
          system: 'React 应用',
          apiKey: 'API密钥',
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
    
    // 将script元素保存到window对象，以便在清理时访问
    window._pageMonitorScript = script;
    
    return () => {
      // 清理
      if (window.pageMonitorInstance && typeof window.pageMonitorInstance.destroy === 'function') {
        window.pageMonitorInstance.destroy();
        delete window.pageMonitorInstance;
      }
      // 移除script元素
      if (window._pageMonitorScript) {
        document.body.removeChild(window._pageMonitorScript);
        delete window._pageMonitorScript;
      }
    };
  }, []);
  
  return <div>React 应用</div>;
}

export default App;
```