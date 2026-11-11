# STRINGS

**实时线条视觉、独立控制面板与现场输入控制。**

A browser-based generative line visual system with nine scenes, a separate control panel, MIDI mapping, and gamepad camera control.

STRINGS 在浏览器中模拟流动、生长与聚散的线条，用于投影内容探索、视觉排练和视频输出。画面窗口负责渲染，控制面板负责切换场景、调节参数与读取控制器。

![STRINGS 线条视觉示例](docs/preview/strings.png)

## 功能

- **九个场景**：漩涡、生长、脉冲、漂流、帷幕、丝带，以及三个鱼眼视角场景。
- **实时调节**：曝光、白色上限、柔光、线宽、速度、扰动、脉冲和总亮度。
- **线条密度 0–10**：1 对应 4,000 条线，10 对应 40,000 条线；默认密度为 3。
- **独立控制面板**：场景切换、自动轮播、黑场、镜头控制与实时设备示意图。
- **MIDI 输入**：预置 Launch Control XL 3 Mode 16 映射，支持 MIDI 学习及本地保存。
- **手柄控制**：通过标准 Gamepad 映射读取 DualSense 等设备，控制镜头及播放状态。
- **两种录制方式**：浏览器 WebM 实时录制，或通过 FFmpeg 逐帧导出 MP4。
- **TouchDesigner 实时接入**：Web Render TOP 内运行 3840×2160 画面，浏览器控制面板通过本地服务跨进程控制。

![控制面板与控制器映射示意](docs/preview/control-panel.png)

*截图为开发过程中的界面与视觉示例；其中的分辨率和帧率读数不作为性能指标。*

## 快速开始

### 环境

- Node.js，`node` 命令可在终端运行。本项目服务端使用 Node 内置模块，无需 `npm install`。
- Chrome 或 Edge，启用硬件加速，支持 WebGL2 和 `EXT_color_buffer_float`。
- 导出 MP4 时还需要 FFmpeg，并将 `ffmpeg` 加入 PATH。
- 仓库内的启动与导出脚本面向 Windows；其他平台可手动运行 Node 服务。

```sh
git clone https://github.com/kuanfuweimu/strings-web.git
cd strings-web
node server.js
```

打开以下两个页面，保持它们使用同一个浏览器配置和同一个地址来源：

| 页面 | 地址 |
| --- | --- |
| 画面输出 | <http://localhost:8787/> |
| 控制面板 | <http://localhost:8787/control.html> |

Windows 下也可直接双击 **`start.bat`**。脚本会启动本地服务，并用独立浏览器配置打开两个窗口。浏览器配置保存在本地 `browser-profile/`。

使用本地服务访问页面，不要直接双击 HTML 文件。输出与控制面板通过同源 `BroadcastChannel` 通信；`localhost` 和 `127.0.0.1` 不应混用。

## TouchDesigner 实时接入

启动或重启新版 `node server.js`，打开 **<http://localhost:8787/touchdesigner.html>** 查看连接说明，也可以从控制面板点击“TouchDesigner 控制”。

1. 在 TD 新建 **Web Render TOP**，将 **URL or File** 设为 `http://localhost:8787/?td=1`。
2. 将 **Active** 和 **Cook Always** 打开；Common 页 **Output Resolution** 选 **Custom Resolution**，宽高填 **3840 / 2160**，关闭 **Use Global Res Multiplier**。
3. 接一个 **Null TOP**，命名 `null_strings`，节点颜色设为 `#2F59AD`。将它接到后续合成、投影或 Movie File Out TOP。
4. 在 Chrome / Edge 打开 **<http://localhost:8787/control.html?td=1>**。看到“TD 实时输出 · 3840×2160”后，即可用面板、MIDI 或手柄控制。

```text
Chrome / Edge 控制面板 ── 本地参数通道 ── Web Render TOP → null_strings → 投影 / 合成 / 录制
                                           3840×2160
```

- **画面如何进入 TD**：Web Render TOP 的 Chromium 运行本项目 WebGL2 视觉程序，将渲染结果作为 TOP 使用；本地 HTTP/SSE 通道只传控制与状态，不传 JPEG 视频帧。不需要 npm 依赖。
- **与浏览器输出的关系**：这是在 TD 内独立渲染，不是 Chrome 窗口捕获，也不是 Spout／NDI 发送器。普通浏览器模式仍用 BroadcastChannel，TD 模式使用独立通道；两边参数互不干扰，画面也不保证逐帧一致。
- **一个服务对应一个 TD 输出**：不要在 Chrome 同时打开 `/?td=1` 预览。需要复用同一画面时，在 TD 内引用同一个 `null_strings`；第二个 TD 渲染端会被拒绝，避免多路状态争抢。
- **分辨率与帧率**：TD 模式画布固定为 3840×2160，TOP 也需按上述设置保持 4K，并使用允许该分辨率的 TD 许可证。实际帧率取决于 GPU、密度和工程负载，未承诺 4K60。无需打开普通浏览器输出窗口，可减少重复 GPU 负载。
- **纯画面输出**：黑底、不显示 HUD。TD 面板禁用浏览器 WebM 下载；在 TD 内录制，或另用项目原有的离线 MP4 导出。
- **断线状态**：服务断开后面板提示重连；连接恢复后继续收发，断线期间的按钮指令不补发。TD 重载页面会从默认参数重新开始。
- **接不上时**：先确认新版服务已启动、URL 和端口一致、只有一个 TD 输出；保持 TD 时间线播放，并让 TOP 被下游使用或打开 Viewer Active。查看 Web Render TOP 的 Info DAT 错误，确认其 Chromium 支持 WebGL2 与 `EXT_color_buffer_float`。连接成功仅证明参数通道工作，TOP 最终尺寸还需在 TD 中确认。

参数传输、消息顺序、掉线重连、重复输出限制及脚本语法已有自动化测试。实际 TouchDesigner 渲染、设备输入与 4K 性能仍需在目标 TD 版本和硬件上验收。

官方接收端说明：[Derivative — Web Render TOP](https://docs.derivative.ca/Web_Render_TOP)。

## 场景

| 编号 | 场景 | 视觉方向 |
| --- | --- | --- |
| 1 | Vortex · 漩涡 | 环绕聚集的线束 |
| 2 | Growth · 生长 | 缓慢向上延伸的线条 |
| 3 | Pulse · 脉冲 | 随脉冲聚散、扩张 |
| 4 | Drift · 漂流 | 松散漂移的流线 |
| 5 | Veil · 帷幕 | 垂落、流动的线幕 |
| 6 | Ribbon · 丝带 | 连续弯曲的线束 |
| 7 | Dome · 穹顶 | 鱼眼视角下的环绕流动 |
| 8 | Canopy · 林冠 | 鱼眼视角下的向上生长 |
| 9 | Nebula · 星云 | 鱼眼视角下的漂移结构 |

## 操作

将输出窗口移到目标显示器，再按 **F** 或双击画面进入全屏。控制面板可以留在另一块屏幕上。

| 输入 | 功能 |
| --- | --- |
| `1`–`9` | 切换场景并关闭自动轮播 |
| `←` / `→` | 上一段 / 下一段 |
| 空格 | 开关自动轮播 |
| `F` / 双击画面 | 进入或退出全屏 |
| `H` | 显示或隐藏画面信息，默认隐藏 |
| `C` | 打开控制面板 |
| `R` | 开始或停止 WebM 录制 |
| 控制面板镜头区域拖动 / 滚轮 / 双击 | 环绕与升降 / 推拉 / 镜头复位 |

实时画面的分辨率随输出窗口和设备像素比变化。全屏不等于固定 4K；固定分辨率的文件请使用下面的离线导出。

### Launch Control XL 3 / MIDI

1. 接入设备，在控制面板点击 **连接 MIDI**，按浏览器提示授权。
2. 默认映射对应代码中的 **Mode 16** 配置。
3. 如设备模板或 CC 编号不同，开启 **MIDI 学习**，点击参数名称，再移动对应旋钮或推子；场景按钮、自动轮播和黑场也可学习绑定。
4. 映射保存在当前浏览器的 `localStorage`；更换浏览器配置后需重新设置。

| MIDI CC | 默认功能 |
| --- | --- |
| 5–12 | 曝光、白色上限、柔光、线宽、密度、速度、扰动、总亮度 |
| 13–20 | 镜头距离、高度、环绕角、视点高度、视角、自动旋转、鱼眼、脉冲 |
| 21–22 | 过渡时长、每段时长 |
| 37–45 | 场景 1–9 |
| 46–50 | 自动轮播、黑场、镜头复位、上一段、下一段 |

[查看 Launch Control XL 3 映射图](docs/lcxl3_map.png)

### PS5 DualSense / 标准映射手柄

接入 USB 或蓝牙后，在页面中按一下手柄按键，并保持控制面板打开。

| 输入 | 功能 |
| --- | --- |
| 左摇杆 | 环绕与镜头升降 |
| 右摇杆 | 视角与视点高度 |
| L2 / R2 | 拉远 / 推近 |
| L1 / R1，方向键左 / 右 | 上一段 / 下一段 |
| 方向键上 / 下 | 调节自动旋转 |
| △ | 镜头复位 |
| ○ | 黑场 |
| × | 自动轮播 |
| Options | 显示或隐藏画面信息 |

[查看 DualSense 映射图](docs/dualsense_map.png)

映射按浏览器的标准 Gamepad 布局读取；实际识别情况取决于设备、连接方式及浏览器。项目已进行模拟输入测试，使用前仍需核对实际硬件。

## 视频导出

### 实时 WebM

在输出窗口按 **R**，或点击控制面板的录制按钮；再次操作结束并下载 WebM。实时录制受浏览器和 GPU 实际运行速度影响。

### 逐帧 MP4

Windows 的 `export.ps1` 使用 Chrome、固定时间步进与 FFmpeg 编码。默认导出全部九个场景，每段 **3840×2160、60 fps、10 秒**。

先结束已占用 8787 端口的本项目 Node 服务，再在项目目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\export.ps1
```

指定场景、时长与密度，例如只导出生长场景，密度 6、时长 20 秒：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\export.ps1 -Query 'w=3840&h=2160&fps=60&secs=20&scenes=2&density=6'
```

`scenes` 使用 1–9 编号，也可传入逗号分隔的列表；`all` 表示全部。输出写入 `out/`，重复导出相同场景会覆盖同名 MP4，需要保留时请先另存。

默认使用 NVIDIA NVENC。没有可用的 NVIDIA 编码器时，在当前 PowerShell 中改用软件编码：

```powershell
$env:ENCODER = 'x264'
.\export.ps1
```

离线输出为 60 fps 不代表浏览器实时运行能达到 60 fps。实时性能受分辨率、线条密度、GPU 和其他运行程序影响。

## 工程结构

```text
strings-web/
├── index.html       # WebGL2 模拟、渲染、场景与视频帧输出
├── control.html     # 独立控制面板、MIDI 与手柄映射
├── server.js        # 本地 HTTP 服务和 FFmpeg 编码入口
├── td-live-server.js # TD 参数与状态中转，不传视频帧
├── td-channel.js     # 浏览器 / TD Chromium 跨进程连接
├── touchdesigner.html # TD 连接说明与控制入口
├── start.bat        # Windows 启动入口
├── start.ps1        # 启动服务及双窗口
├── export.ps1       # 离线 MP4 导出入口
├── tests/           # TD 实时通道测试
└── docs/            # 控制器说明、映射图与项目预览
```

`out/` 导出视频、`shots/` 开发测试素材、`browser-profile/` 浏览器个人数据均不纳入 Git。本仓库仅包含网页工程。

运行 TD 通道测试（Node.js 18+，无需安装依赖）：

```sh
node --test tests/td-live.test.js
```

## 使用说明

- **控制面板显示“等待输出窗口”**：确认输出页面已打开，两页的主机名、端口及浏览器配置一致。
- **MIDI 已授权但无设备**：检查连接，关闭可能占用设备的其他软件，再点击连接 MIDI。
- **手柄没有被识别**：先按一个按键，并确认浏览器报告标准 Gamepad 映射。
- **画面性能不足**：先降低密度、输出窗口分辨率，或减少同时运行的输出窗口。
- **多块屏幕需要完全相同的画面**：每个输出窗口各自运行模拟，参数同步不会让画面逐帧一致。需要一致画面时，可复制同一路显示输出。

视觉研究参考：[MONOCOLOR — Entangled Structures](https://mnclr.com/entangled-structures)。本仓库提供浏览器视觉系统的实现与控制工具。
