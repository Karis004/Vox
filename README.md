# Vox 晨报工作台

网页编排晨报，FastAPI取数据和生成口播，Leonardo定时请求并逐段朗读。React + TypeScript + Vite、FastAPI、SQLite；日期统一香港UTC+8。完整状态见 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)。

## 新增新闻模板

新增 **金融新闻** 和 **精算与保险新闻**。想听三个范围，添加两个金融模块，分别选全球／香港，再加精算模块。每个最多1～3条，默认2条；详细Prompt及名称替换表可编辑。既有编排保留，不自动改写。

真实出版方RSS／金管局JSON提供标题摘要，已有AI服务筛选与改写，不凭模型记忆生成时事。优先香港前一天；不足时金融回顾近两天、精算近七天，明确日期，不凑数。测试展示引用、来源错误、实际AI消息。只使用订阅材料，不声称读取付费全文，不保证覆盖所有重大事件。

全球：CNBC全球／财经、BBC商业。香港：香港电台财经、金管局。精算：Artemis、Insurance Journal、SOA精算杂志、Reinsurance News、金管局。订阅源不需要新密钥；AI沿用已有服务并按该服务计费。

保留AIA、AXA、HSBC、PRU、PWC、EY、KPMG、股票代码和常见专业缩写；Prudential→PRU，Donald Trump→特朗普。替换表每行 `原名=播报名称`。普通英文词或无效格式自动修正一次，仍失败显示错误。新闻模板已包含AI，不需第二层加工。

预览／模块测试只用当前编辑，不保存；保存写SQLite，设备读已保存版本。真实.env和密钥仅在服务端。

## 本地运行

```powershell
npm install
npm run dev
npm run build
npm run start
```

开发页localhost:5173，API为localhost:8000。start在8000提供构建页与API。npm管理.venv。AI沿用.env中OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL。

## 正式固件与交付

解压 `release/vox-daily-firmware.zip`，Arduino IDE打开 [hardware/daily_briefing/daily_briefing.ino](hardware/daily_briefing/daily_briefing.ino)，选择 **Arduino Leonardo** 和串口上传。同目录三个.h必须保留。先部署服务，再上传。

- 40.233.65.88:8086，普通HTTP。
- 上电约两秒自动校时；整点每小时校时；每天香港 **07:15** 播保存的晨报。
- 按钮／t即时播放，播放中不重复；s看状态，x停止后续段落，已开始一段会读完。
- 服务器07:10预生成，07:10～07:30每30秒检查准备状态。配置更改影响下次生成，已取到的快照不变。
- 每段最多180 UTF-8字节，保留192字节接收缓冲；失败30秒后重试同一段，等估算播放完成才继续。
- 首次校时已到／超过07:15，等次日；当天补听按按钮。断电无RTC／持久化去重。服务器中途重启或快照过期可能从第一段重播。
- TTS没有回传，播放结束为保守估算；网络与生成失败可能延后出声。

正式版编译和软件检查通过，尚未上传或做公网／过夜验收。成功接线见 [hardware/README.md](hardware/README.md)。时间回退版与配网AT桥保留。

## Docker部署到8086

解压 `release/vox-server.zip` 到服务器目录，准备真实.env：

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

frontend负责网页；backend/news.py负责新闻证据和Prompt；speech.py负责读法；device_briefing.py负责预生成、快照和分段；device_time.py负责时间。hardware只保留daily_briefing、time_http_voice、esp_at_bridge。data/vox.db保留；release为交付包。

已检查前端构建、真实新闻与现有AI、Leonardo编译、Docker构建及容器网页/API、HTTP/1.0分段、C++各种分包和时间边界。临时检查放系统TEMP，未恢复pytest。

来源说明：[香港电台RSS](https://news.rthk.hk/rthk/ch/rss.feed)、[金管局API](https://apidocs.hkma.gov.hk/documentation/press-releases/)、[Insurance Journal RSS](https://www.insurancejournal.com/newsfeed/)、[Artemis](https://www.artemis.bm/)、[BBC feeds](https://support.bbc.co.uk/platform/feeds/NewsFeeds.htm)。
