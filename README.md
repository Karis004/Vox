# Vox 晨报工作台

网页编排晨报，FastAPI取数据和生成口播，Leonardo定时请求并逐段朗读。React + TypeScript + Vite、FastAPI、SQLite；日期统一香港UTC+8。新聊天入口与开发约定见 [AGENTS.md](AGENTS.md)，完整状态见 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)。

网页按“模块库 → 模块列表 → 模块编辑”排列，前两栏等宽，编辑区约为单栏的1.6倍。点击模板立即添加、选中并提示；中间列表可拖动排序，完整稿预览在列表下方。窄屏用“模块／列表／编辑”切换。模块ID使用兼容公网HTTP的getRandomValues，避免randomUUID仅支持安全上下文导致添加失败。

**发布约定：后续改动先留在本地，只有用户明确要求才推送GitHub或更新服务器，允许积累多项修改后统一发布。** 设备日志和预取源码已于2026-10-18按本批授权发布，用户确认已上传对应固件；各按钮接线／定时可靠性仍以实测为准。

2026-10-18用户确认已上传 `vox-daily-logs-firmware.zip` 新固件，并授权本批GitHub推送／服务器更新；最新执行结果见handoff第13节，覆盖上文10月11日的候选状态。固件固定访问 `40.233.65.88:8086`，保持固件不变时主板联调走服务器；网页／后端仍可用构建和进程内临时数据库在本地检查。只更新网页／后端通常无需再次刷主板；改变设备端逻辑或目标地址才需要新固件。每批更新仍需用户授权。

## 设备日志与停顿排查

**2026-10-19已上线：** 日志增加请求开始／返回编号、单来源／AI阶段、故障建议、状态面板、事件筛选及USB采集导入；主板没连上网时仍可用 `./scripts/capture-device.ps1 -Port COM10 -Seconds 90` 在项目终端采集并保存，现有固件不用重刷。实际端口以本机Arduino为准，导入入口已随新网页上线。已从本轮COM10抓到ESP基础AT无响应，而非服务器校时接口报错；完整步骤及证据见 [诊断说明](hardware/DIAGNOSTICS.md)。10月18日新闻AI上游曾返回522／模型列表超时；用户10月19日更换服务器.env，本批已重新创建容器并复核。部分失败稿已改为五分钟后可重新生成，避免一直复用失败内容。

后续实机已恢复校时和播报，真实日志确认预取有效（约0.6秒），旧33秒估算仍产生静音。另有本地 `release/vox-daily-recovery-firmware.zip` 候选：首次重试加快、失败阶段提示、等待系数450→400，尚未上传。服务端新增AI故障时中文来源标题播报，全球补充香港电台财经／国际、专业补充香港保监局；保留日期、来源、warning和原AI错误，不把标题说成AI摘要。已实际找到两个范围的可用标题；具体版本和限制见handoff第15节。

右上角“设备日志”打开按香港日期查询的窗口：校时／取稿请求、HTTP状态和耗时、各模块生成结果、实际稿件和分段；支持刷新、分页及导出当天JSON。保留30天，最多10000条事件／200份稿件。数据库 `data/device-log.db` 沿用Docker数据卷，不需新增.env；日志故障不会阻止设备接口。稿件可能包含私密内容，日志访问沿用现有网站的部署保护条件。

服务器收到请求不等于设备收到或实际出声。新固件增加发送帧／估算等待／整次取稿耗时遥测，并在当前段播放时预取下一段，减少段间联网等待；仍保留450ms每字符＋1500ms的播放估算，不能保证所有停顿消失。详细字段、排查步骤、自然语音候选和板子固定方案见 [硬件诊断与整理](hardware/DIAGNOSTICS.md)。旧固件也能产生服务器请求日志，新增遥测和预取需上传候选固件；建议统一发布时先更新服务器，再更新主板。

## 新增新闻模板

新增 **金融新闻** 和 **精算与保险新闻**。想听三个范围，添加两个金融模块，分别选全球／香港，再加精算模块。每个最多1～3条，默认2条；详细Prompt及名称替换表可编辑。既有编排保留，不自动改写。

真实出版方RSS／金管局JSON提供标题摘要，已有AI服务筛选与改写，不凭模型记忆生成时事。优先香港前一天；不足时金融回顾近两天、精算近七天，明确日期，不凑数。测试展示引用、来源错误、实际AI消息。只使用订阅材料，不声称读取付费全文，不保证覆盖所有重大事件。

全球：CNBC全球／财经、BBC商业。香港：香港电台财经、金管局。精算：Artemis、Insurance Journal、SOA精算杂志、Reinsurance News、金管局。订阅源不需要新密钥；AI沿用已有服务并按该服务计费。

保留AIA、AXA、HSBC、PRU、PWC、EY、KPMG、股票代码和常见专业缩写；Prudential→PRU，Donald Trump→特朗普。替换表每行 `原名=播报名称`。普通英文词或无效格式自动修正一次，仍失败显示错误。新闻模板已包含AI，不需第二层加工。

预览／模块测试只用当前编辑，不保存；保存写SQLite，设备读已保存版本。真实.env和密钥仅在服务端。

## AI配置状态与测速

网页右上角“AI状态 / 日志”（窄屏显示AI）打开“AI配置与测速”。只显示运行中的密钥／模型是否设置、接口格式和默认／自定义模式，不返回真实值，也不提供.env编辑。打开窗口和刷新只检查配置状态，不产生AI费用；点击“AI测速（少量调用）”才从服务器发一次短文本生成，显示成功／失败、总耗时和安全诊断，最多等待30秒。它不查询余额，不代表全部新闻来源正常。

在服务器修改.env后，重新创建容器才能更新环境变量；单独docker restart不会加载新值。可执行：

```sh
cd /home/ubuntu/Vox
docker compose up -d --force-recreate --wait --wait-timeout 120 vox
```

同时更新源码时使用 `docker compose up -d --build --force-recreate --wait --wait-timeout 120 vox`。保留已有数据卷，不需要重填其他配置。本批已部署并重建容器加载新.env，功能提交f5e9ea2。额外修正了新供应商地址缺少/v1；模型列表200且包含当前模型，但实际网页测速仍返回HTTP503、耗时1.12秒（10月19日00:47香港时间）。还需在供应商侧核对模型通道／额度，不能视为新闻AI已恢复。发布证据见handoff第16节；主板固件候选仍需单独上传。

## 本地运行

```powershell
npm install
npm run dev
npm run build
npm run start
```

开发页localhost:5173，API为localhost:8000。start在8000提供构建页与API。npm管理.venv。AI沿用.env中OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL。

## 正式固件与交付

本次日志／预取固件包为 `release/vox-daily-logs-firmware.zip`，用户已确认上传；`release/vox-daily-buttons-firmware.zip` 保留上一发布批次。操作和接线见 [hardware/daily_briefing/README.md](hardware/daily_briefing/README.md)。Arduino IDE打开daily_briefing.ino，选择 **Arduino Leonardo**；同目录五个.h必须保留。旧单按钮交付包已移除，避免上传错误版本。

- 40.233.65.88:8086，普通HTTP。
- 上电约两秒自动校时；整点每小时校时；每天按EEPROM保存的香港时间播晨报，默认 **07:15**。
- 8号重置校时、7号／t补听；6号累加小时→1号确认整点→5号每次加5分钟→1号保存。只设小时也可，30秒退出设定；断电保留时间。s看状态，x停止后续段落，已开始一段会读完。
- 服务器已更新：后端按主板daily校时报上的时间，提前5分钟至计划后15分钟每30秒检查准备状态；支持任意时间请求时按需生成，首次503，主板每30秒重试。配置更改影响下次生成，已取到的快照不变。
- 每段最多180 UTF-8字节，保留192字节接收缓冲；失败30秒后重试同一段，等估算播放完成才发下一帧。日志／预取版会在播放期间提前取下一段。
- 首次校时已到／超过设定时刻，等次日；当天补听按7号。断电保留设置，但无RTC／持久化播放去重。服务器中途重启或快照过期可能从第一段重播。
- 8号提示校时开始／成功／失败，7号无稿提示等待，有稿直读；6／5反馈数值，1确认保存时间。快速连按保留最新提示。TTS没有回传，播放结束为保守估算；网络与生成失败可能延后出声。

日志／预取版Leonardo编译和软件检查通过，用户于2026-10-18确认已上传；本次代理只更新服务器，未操作主板，尚未核实新版本实际声音／停顿。原成功接线见 [hardware/README.md](hardware/README.md)，多按钮版必须先将L2从GND改接D8并补接其他矩阵信号线；已经完成者无需因本次预取再改线。时间回退版与配网AT桥保留，过夜／异常恢复仍须实测。

## Docker部署到8086

2026-10-08已按用户授权首次推送到 [GitHub](https://github.com/Karis004/Vox)，并通过SSH别名 `my` 部署到 `/home/ubuntu/Vox`。服务器ARM64镜像构建成功，容器 `vox-vox-1` 健康；真实.env及原保存编排已私下迁移，文件权限600。无需重新填写现有AI配置。全球、香港、精算新闻在服务器分别生成成功，设备稿分段及Content-Length检查通过。本机没有Vox容器或网页服务运行。

2026-10-09已通过浏览器访问公网8086并检查网页/API、六种模板添加、自动选中、编辑同步、启停、鼠标拖动和手机切换；已修复HTTP页面添加按钮报错并更新布局。10月8日的公网超时为当时检查结果，目前浏览器访问正常。云规则仍应允许网页及设备所在网络访问TCP8086。

后续更新：

```sh
ssh my
cd /home/ubuntu/Vox
git pull --ff-only
docker compose up -d --build
```

首次部署其他机器时，克隆仓库或解压 `release/vox-server.zip`，单独准备真实.env：

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail 60 vox
```

映射 **8086:8000**，网页和设备均访问 [http://40.233.65.88:8086/](http://40.233.65.88:8086/)。加拿大位置不改变香港日期；主机时钟应准确，云安全组和防火墙允许TCP8086。

配置在vox-data命名卷，普通重建保留，请勿删除卷。首次空卷使用默认编排。迁移本机已保存内容时，单独复制data/vox.db到服务器项目的data/vox.db，在首次启动前：

```sh
docker compose create
docker compose cp ./data/vox.db vox:/app/data/vox.db
docker compose up -d
```

数据库可能含HTTP请求头，按私有文件迁移；已有服务器数据先备份，不覆盖。交付包／镜像不含真实.env、密钥或本机数据库。

验收：/health、/device/time?mode=daily&hour=7&minute=15、/device/briefing。manifest首次503是准备中；200返回v、id、parts；/device/briefing-part?id=返回id&part=0取第一段。

沿用原型无鉴权接口，公网保护由部署环境补上。网页／api可经代理保护；device需直接返回普通HTTP、text/plain、Content-Length，不得跳登录页／HTTPS、压缩或chunked。

## 文件与检查

frontend负责网页；backend/news.py负责新闻证据和Prompt；speech.py负责读法；device_briefing.py负责预生成、快照和分段；device_time.py负责时间；device_log.py负责持久化设备历史。hardware只保留daily_briefing、time_http_voice、esp_at_bridge。data/vox.db与device-log.db保留；release为交付包，现有vox-server.zip仍属于上一发布批次。

已检查前端构建、真实新闻与现有AI、Leonardo编译、Docker本机x64及服务器ARM64构建、容器网页/API、HTTP/1.0分段、C++各种分包和时间边界。临时检查放系统TEMP，未恢复pytest。

来源说明：[香港电台RSS](https://news.rthk.hk/rthk/ch/rss.feed)、[金管局API](https://apidocs.hkma.gov.hk/documentation/press-releases/)、[Insurance Journal RSS](https://www.insurancejournal.com/newsfeed/)、[Artemis](https://www.artemis.bm/)、[BBC feeds](https://support.bbc.co.uk/platform/feeds/NewsFeeds.htm)。
