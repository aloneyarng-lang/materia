// Built-in appearances; loaded directly with the application, without importing a theme file.
export const GLASS_PRESETS=[
  {
    "id": "liquid-glass",
    "name": "液态玻璃 · 浅色",
    "description": "内置外观 · SF Pro · 清透纯色 · 按压回弹",
    "tokens": {
      "--paper": "#e6e8ec",
      "--surface": "#ffffff",
      "--canvas": "#f1f2f5",
      "--panel": "#dedfe4",
      "--sidebar": "#eceef2",
      "--ink": "#1d1d1f",
      "--muted": "#56565f",
      "--line": "#3b3d451a",
      "--teal": "#0071e3",
      "--teal-light": "#007aff16",
      "--on-accent": "#ffffff",
      "--warning": "#865000",
      "--warning-soft": "#fff0cb",
      "--danger": "#c92b3e",
      "--danger-soft": "#ffeaed",
      "--shadow": "#0a12251a",
      "--theme-mode": "light",
      "--sans": "'Materia SF Pro', -apple-system, BlinkMacSystemFont, 'Materia Inter', 'PingFang SC', 'Materia Source Han Sans', 'Microsoft YaHei UI', sans-serif",
      "--font-size": "13px",
      "--font-weight": "400",
      "--line-height": "1.7",
      "--serif": "'Materia SF Pro', -apple-system, BlinkMacSystemFont, 'Materia Inter', 'PingFang SC', 'Materia Source Han Sans', 'Microsoft YaHei UI', sans-serif",
      "--heading-scale": "1.04",
      "--heading-weight": "600",
      "--heading-line-height": "1.5",
      "--numeric": "'Materia SF Pro', -apple-system, BlinkMacSystemFont, 'Materia Inter', 'PingFang SC', 'Materia Source Han Sans', 'Microsoft YaHei UI', sans-serif",
      "--mono": "'Materia SF Mono', 'SF Mono', 'Materia Source Code Pro', Consolas, 'Materia Source Han Sans', monospace",
      "--graph-node-shape": "circle",
      "--graph-relation-shape": "circle",
      "--graph-node-fill": "hollow",
      "--graph-edge-style": "curve",
      "--graph-edge-dash": "solid",
      "--graph-background": "plain",
      "--graph-color-mode": "accent",
      "--graph-node-scale": "1.12",
      "--graph-node-stroke": "1.6",
      "--graph-edge-width": "0.85",
      "--graph-edge-opacity": "0.3",
      "--graph-label-scale": "1",
      "--graph-label-halo": "3px",
      "--graph-glow": "1.2px",
      "--graph-edge-color": "auto",
      "--graph-label-color": "auto",
      "--graph-twinkle": "off",
      "--radius": "16px"
    },
    "ui": {
      "style": "glass",
      "density": 1.04,
      "radius": 16,
      "buttonRadius": 18,
      "cardRadius": 20,
      "menuRadius": 18,
      "borderWidth": 1,
      "sidebarWidth": 224,
      "controlHeight": 34,
      "cardPadding": 18,
      "menuPadding": 8,
      "cardGap": 12,
      "buttonStyle": "solid",
      "cardStyle": "elevated",
      "sidebarStyle": "tinted",
      "shadow": "lifted"
    },
    "icons": {
      "style": "rounded",
      "strokeWidth": 1.55,
      "size": 19,
      "overrides": {
        "library": [
          {
            "tag": "rect",
            "attrs": {
              "x": 3.5,
              "y": 4,
              "width": 17,
              "height": 16,
              "rx": 3
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M9 4v16M13 8h4M13 12h4"
            }
          }
        ],
        "folder": [
          {
            "tag": "path",
            "attrs": {
              "d": "M3 8a2.5 2.5 0 0 1 2.5-2.5h4L12 8h6.5a2.5 2.5 0 0 1 2.5 2.5V18a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18Z"
            }
          }
        ],
        "orbit": [
          {
            "tag": "circle",
            "attrs": {
              "cx": 12,
              "cy": 12,
              "r": 3
            }
          },
          {
            "tag": "ellipse",
            "attrs": {
              "cx": 12,
              "cy": 12,
              "rx": 10,
              "ry": 6
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M12 2v3M12 19v3"
            }
          }
        ],
        "assistant": [
          {
            "tag": "path",
            "attrs": {
              "d": "M12 3c0 5-4 9-9 9 5 0 9 4 9 9 0-5 4-9 9-9-5 0-9-4-9-9Z"
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M20 2v4M18 4h4"
            }
          }
        ],
        "settings": [
          {
            "tag": "path",
            "attrs": {
              "d": "M4 6h16M4 12h16M4 18h16"
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 9,
              "cy": 6,
              "r": 2
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 15,
              "cy": 12,
              "r": 2
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 8,
              "cy": 18,
              "r": 2
            }
          }
        ],
        "chart": [
          {
            "tag": "rect",
            "attrs": {
              "x": 3,
              "y": 3,
              "width": 18,
              "height": 18,
              "rx": 4
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M7 16v-3M12 16V8M17 16v-6"
            }
          }
        ],
        "network": [
          {
            "tag": "circle",
            "attrs": {
              "cx": 6,
              "cy": 6,
              "r": 2.5
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 18,
              "cy": 7,
              "r": 2.5
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 10,
              "cy": 18,
              "r": 2.5
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M8.5 6.2 15.5 7M7 8.5l2.2 7M16.7 9.2l-5.2 6.8"
            }
          }
        ],
        "palette": [
          {
            "tag": "circle",
            "attrs": {
              "cx": 12,
              "cy": 12,
              "r": 9
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 8,
              "cy": 9,
              "r": 1
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 12,
              "cy": 7,
              "r": 1
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 16,
              "cy": 9,
              "r": 1
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M7 15c2.5 3 7.5 3 10 0"
            }
          }
        ],
        "search": [
          {
            "tag": "circle",
            "attrs": {
              "cx": 10.5,
              "cy": 10.5,
              "r": 6.5
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "m15.5 15.5 5 5"
            }
          }
        ],
        "files": [
          {
            "tag": "rect",
            "attrs": {
              "x": 6,
              "y": 3,
              "width": 14,
              "height": 18,
              "rx": 3
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M3 7v12a4 4 0 0 0 4 4M10 8h6M10 12h6M10 16h4"
            }
          }
        ],
        "list": [
          {
            "tag": "path",
            "attrs": {
              "d": "M8 6h12M8 12h12M8 18h12"
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 4,
              "cy": 6,
              "r": 0.6
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 4,
              "cy": 12,
              "r": 0.6
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 4,
              "cy": 18,
              "r": 0.6
            }
          }
        ]
      }
    },
    "graph": {
      "nodeShape": "circle",
      "relationShape": "circle",
      "nodeFill": "hollow",
      "edgeStyle": "curve",
      "edgeDash": "solid",
      "background": "plain",
      "colorMode": "accent",
      "nodeScale": 1.12,
      "nodeStroke": 1.6,
      "edgeWidth": 0.85,
      "edgeOpacity": 0.3,
      "labelScale": 1,
      "labelHalo": 3,
      "glow": 1.2,
      "edgeColor": "auto",
      "labelColor": "auto",
      "starDensity": 1,
      "starOpacity": 0.55,
      "starColor": "#cfe3ff",
      "nebulaIntensity": 0.5,
      "nebulaColor": "#6553ab",
      "nebulaColorSecondary": "#257c9b",
      "orbitScale": 1.65,
      "orbitTilt": 25,
      "twinkle": "off",
      "seed": 42
    }
  },
  {
    "id": "liquid-glass-dark",
    "name": "液态玻璃 · 深色",
    "description": "内置外观 · SF Pro · 清透纯色 · 按压回弹",
    "tokens": {
      "--paper": "#15161a",
      "--surface": "#25262b",
      "--canvas": "#1c1d22",
      "--panel": "#33343b",
      "--sidebar": "#25262a",
      "--ink": "#f5f5f7",
      "--muted": "#bdbdc7",
      "--line": "#ffffff20",
      "--teal": "#67b5ff",
      "--teal-light": "#0a84ff29",
      "--on-accent": "#061a33",
      "--warning": "#ffdc8a",
      "--warning-soft": "#493b28",
      "--danger": "#ffb4c0",
      "--danger-soft": "#482a36",
      "--shadow": "#00000050",
      "--theme-mode": "dark",
      "--sans": "'Materia SF Pro', -apple-system, BlinkMacSystemFont, 'Materia Inter', 'PingFang SC', 'Materia Source Han Sans', 'Microsoft YaHei UI', sans-serif",
      "--font-size": "13px",
      "--font-weight": "400",
      "--line-height": "1.7",
      "--serif": "'Materia SF Pro', -apple-system, BlinkMacSystemFont, 'Materia Inter', 'PingFang SC', 'Materia Source Han Sans', 'Microsoft YaHei UI', sans-serif",
      "--heading-scale": "1.04",
      "--heading-weight": "600",
      "--heading-line-height": "1.5",
      "--numeric": "'Materia SF Pro', -apple-system, BlinkMacSystemFont, 'Materia Inter', 'PingFang SC', 'Materia Source Han Sans', 'Microsoft YaHei UI', sans-serif",
      "--mono": "'Materia SF Mono', 'SF Mono', 'Materia Source Code Pro', Consolas, 'Materia Source Han Sans', monospace",
      "--graph-node-shape": "circle",
      "--graph-relation-shape": "circle",
      "--graph-node-fill": "hollow",
      "--graph-edge-style": "curve",
      "--graph-edge-dash": "solid",
      "--graph-background": "plain",
      "--graph-color-mode": "accent",
      "--graph-node-scale": "1.12",
      "--graph-node-stroke": "1.6",
      "--graph-edge-width": "0.85",
      "--graph-edge-opacity": "0.3",
      "--graph-label-scale": "1",
      "--graph-label-halo": "3px",
      "--graph-glow": "1.2px",
      "--graph-edge-color": "auto",
      "--graph-label-color": "auto",
      "--graph-twinkle": "off",
      "--radius": "16px"
    },
    "ui": {
      "style": "glass",
      "density": 1.04,
      "radius": 16,
      "buttonRadius": 18,
      "cardRadius": 20,
      "menuRadius": 18,
      "borderWidth": 1,
      "sidebarWidth": 224,
      "controlHeight": 34,
      "cardPadding": 18,
      "menuPadding": 8,
      "cardGap": 12,
      "buttonStyle": "solid",
      "cardStyle": "elevated",
      "sidebarStyle": "tinted",
      "shadow": "lifted"
    },
    "icons": {
      "style": "rounded",
      "strokeWidth": 1.55,
      "size": 19,
      "overrides": {
        "library": [
          {
            "tag": "rect",
            "attrs": {
              "x": 3.5,
              "y": 4,
              "width": 17,
              "height": 16,
              "rx": 3
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M9 4v16M13 8h4M13 12h4"
            }
          }
        ],
        "folder": [
          {
            "tag": "path",
            "attrs": {
              "d": "M3 8a2.5 2.5 0 0 1 2.5-2.5h4L12 8h6.5a2.5 2.5 0 0 1 2.5 2.5V18a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18Z"
            }
          }
        ],
        "orbit": [
          {
            "tag": "circle",
            "attrs": {
              "cx": 12,
              "cy": 12,
              "r": 3
            }
          },
          {
            "tag": "ellipse",
            "attrs": {
              "cx": 12,
              "cy": 12,
              "rx": 10,
              "ry": 6
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M12 2v3M12 19v3"
            }
          }
        ],
        "assistant": [
          {
            "tag": "path",
            "attrs": {
              "d": "M12 3c0 5-4 9-9 9 5 0 9 4 9 9 0-5 4-9 9-9-5 0-9-4-9-9Z"
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M20 2v4M18 4h4"
            }
          }
        ],
        "settings": [
          {
            "tag": "path",
            "attrs": {
              "d": "M4 6h16M4 12h16M4 18h16"
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 9,
              "cy": 6,
              "r": 2
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 15,
              "cy": 12,
              "r": 2
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 8,
              "cy": 18,
              "r": 2
            }
          }
        ],
        "chart": [
          {
            "tag": "rect",
            "attrs": {
              "x": 3,
              "y": 3,
              "width": 18,
              "height": 18,
              "rx": 4
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M7 16v-3M12 16V8M17 16v-6"
            }
          }
        ],
        "network": [
          {
            "tag": "circle",
            "attrs": {
              "cx": 6,
              "cy": 6,
              "r": 2.5
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 18,
              "cy": 7,
              "r": 2.5
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 10,
              "cy": 18,
              "r": 2.5
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M8.5 6.2 15.5 7M7 8.5l2.2 7M16.7 9.2l-5.2 6.8"
            }
          }
        ],
        "palette": [
          {
            "tag": "circle",
            "attrs": {
              "cx": 12,
              "cy": 12,
              "r": 9
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 8,
              "cy": 9,
              "r": 1
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 12,
              "cy": 7,
              "r": 1
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 16,
              "cy": 9,
              "r": 1
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M7 15c2.5 3 7.5 3 10 0"
            }
          }
        ],
        "search": [
          {
            "tag": "circle",
            "attrs": {
              "cx": 10.5,
              "cy": 10.5,
              "r": 6.5
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "m15.5 15.5 5 5"
            }
          }
        ],
        "files": [
          {
            "tag": "rect",
            "attrs": {
              "x": 6,
              "y": 3,
              "width": 14,
              "height": 18,
              "rx": 3
            }
          },
          {
            "tag": "path",
            "attrs": {
              "d": "M3 7v12a4 4 0 0 0 4 4M10 8h6M10 12h6M10 16h4"
            }
          }
        ],
        "list": [
          {
            "tag": "path",
            "attrs": {
              "d": "M8 6h12M8 12h12M8 18h12"
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 4,
              "cy": 6,
              "r": 0.6
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 4,
              "cy": 12,
              "r": 0.6
            }
          },
          {
            "tag": "circle",
            "attrs": {
              "cx": 4,
              "cy": 18,
              "r": 0.6
            }
          }
        ]
      }
    },
    "graph": {
      "nodeShape": "circle",
      "relationShape": "circle",
      "nodeFill": "hollow",
      "edgeStyle": "curve",
      "edgeDash": "solid",
      "background": "plain",
      "colorMode": "accent",
      "nodeScale": 1.12,
      "nodeStroke": 1.6,
      "edgeWidth": 0.85,
      "edgeOpacity": 0.3,
      "labelScale": 1,
      "labelHalo": 3,
      "glow": 1.2,
      "edgeColor": "auto",
      "labelColor": "auto",
      "starDensity": 1,
      "starOpacity": 0.55,
      "starColor": "#cfe3ff",
      "nebulaIntensity": 0.5,
      "nebulaColor": "#6553ab",
      "nebulaColorSecondary": "#257c9b",
      "orbitScale": 1.65,
      "orbitTilt": 25,
      "twinkle": "off",
      "seed": 42
    }
  }
];
