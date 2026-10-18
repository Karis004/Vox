# Vox 项目交接

更新：2026-10-18；目录C:/Users/28623/Documents/ForFun/Vox。当前目标：网页编排真实内容，服务器生成中文晨报，Leonardo每天香港设定时间（默认07:15）主动请求并分段朗读。加拿大服务器指定40.233.65.88，网页和设备统一外部HTTP端口8086。

最新进展2026-10-18：用户确认已上传第12节日志／预取固件，并授权本批推送GitHub与更新服务器。发布结果见第13节；下文10月11日的“尚未上传／待发布”保留为当时记录。

## 新聊天摘要

新聊天先读 [AGENTS.md](AGENTS.md)，再按任务读本文相关章节和README。React18 + TypeScript5.6 + Vite6，FastAPI + SQLite，Leonardo + ESP-01S + HS-S77-PL。旧按钮联网、约10分钟校时短测已实机通过；语音板不能正确读英文单词，只能逐字母，新闻按熟悉简称与中文词改写。daily_briefing有矩阵按钮、EEPROM时间、上电启动、每小时整点校时、每日香港设定时间（默认07:15）播报；7补听、8重置校时、6/1/5/1设时间，40.233.65.88:8086。2026-10-11用户最新确认已经上传上一发布固件并实际播报，反映长期段间停顿；板有TX／RX／VCC／GND，无BUSY，程序不读取TX。当前本地新增设备日志窗口／持久库、预取和遥测，尚未推送／部署／上传，见第12节；新候选未经实机听测。旧time_http_voice保留作回退，esp_at_bridge作配网，早期其他草图／demo／pytest残留已删除。GitHub／服务器上一批更新完成到a8fc2fd，本机未运行Vox服务；真实.env与数据库未进GitHub。不要擅自启动本机服务、上传固件或宣称未做过的实机验证。

**最新发布约定：后续先改本地，只有再次明确要求推送GitHub／更新服务器时才做，不逐项自动发布。2026-10-11语音反馈和网页等宽授权批次已完成，见第10节；用户后来确认主板已上传该版。当前日志／预取批次未获发布指令，此前授权不延伸。**

## 1. 当前进度与证据

| 部分 | 状态 |
| --- | --- |
| 旧ESP双向AT、Wi-Fi、按钮HTTP→语音 | 用户已实机确认 |
| 混合文字 | 用户确认有声音；最新确认英文单词不能正常发音，不能以早期混合稿测试推定支持英文 |
| 旧时间短测 | 用户运行约10分钟无异常；不是过夜／断网验收 |
| 网页原有编排、保存、模块／AI测试 | 已有；本次继续保留 |
| 金融＋精算新闻模板 | 已实现；全球、香港、精算均用真实来源与现有AI生成成功 |
| 网站保存内容→设备分段接口 | 已实现；本地容器实际HTTP/1.0及C++解析通过 |
| 动态每日时间与多按钮 | 上一批已发布，用户确认主板已上传且有播报；其他键号／定时可靠性仍需实测 |
| 设备日志与段间预取 | 本地实现、构建与软件检查通过，未发布／上传；详见第12节 |
| Docker8086 | 本机x64、服务器ARM64构建成功；已部署/home/ubuntu/Vox，容器健康，服务器网页/API及三种新闻检查通过 |
| GitHub | https://github.com/Karis004/Vox，main首提交b877a23；真实.env／数据库／密钥均未提交 |
| 公网8086 | 10月9日浏览器已可访问网页/API；HTTP添加问题已复现修复；硬件跨网待实测 |
| 准确出声时间、过夜、多日／断电 | 待进一步实测，不由固件已上传推定通过 |

临时检查用TEMP中的Python unittest和C++，没有pytest或新增测试环境。UTF-8随机长稿重组、全年边界相关日（10月8日、12月31日）各1440分钟的每日计划、调快调慢／回绕／积压、快照冻结／配置变更、错误源／日期过滤／英文输出拒绝、真实容器长稿17段和每种分包长度已检查。前一版正式AVR：20376字节flash、1618字节静态RAM，余942字节栈／局部变量；当前语音反馈版资源见第10节。软件结果不等于实际喇叭完成报告。

## 2. 架构与代码

| 文件 | 责任 |
| --- | --- |
| frontend/src/App.tsx | 当前／保存配置、增删、预览／保存；防异步结果覆盖新的编辑 |
| components/Inspector.tsx | 原有文本、变量、HTTP、AI；新闻范围／条数／Prompt／名称表／引用测试 |
| components/ModuleLibrary.tsx、Canvas.tsx、SortableBlock.tsx | 模板库、顺序、整体稿、拖动与开关 |
| types.ts、icons.tsx、styles.css | 六种模块类型／图标；库→列表→编辑，比例1:1:1.6，手机断点1000 |
| backend/main.py | API、构建网页、lifespan预生成任务；不存在的api/device不回HTML |
| backend/models.py | 编排模型；新增news/actuarial与NewsConfig校验 |
| backend/defaults.py | 原有默认编排、六种模板；不改数据库中的旧编排 |
| backend/news.py | 固定来源、日期筛选、详细默认Prompt、引用和口播输出检查 |
| backend/speech.py | 设备读法规则及名称替换，百分比口播 |
| backend/executor.py | 来源／模板／AI、并发有序合稿、模块错误隔离；新闻内部AI与其他AI共享配置 |
| backend/device_briefing.py | 跟随主板daily时间动态预热、不可变快照、180字节UTF-8分段 |
| backend/device_time.py | 香港时间与test/daily计划；daily默认07:15 |
| backend/template.py | 日期UTC+8、变量替换和JSON路径 |
| backend/repository.py | SQLite一份配置，连接按作用域提交并显式关闭 |
| backend/settings.py | .env与环境变量配置 |
| hardware/daily_briefing | 本地多按钮固件，自含5个头文件；schedule_settings负责设定／EEPROM，keypad负责矩阵与事件队列 |
| hardware/time_http_voice | 已实机通过的独立时间短测回退 |
| hardware/esp_at_bridge | ESP更换Wi-Fi |
| scripts/ | npm自动准备／调用.venv |
| data/vox.db | 原用户保存数据，保留 |
| Dockerfile、docker-compose.yml | 多阶段构建、单服务、8086:8000、命名卷 |
| release/vox-server.zip、vox-daily-buttons-firmware.zip | 本地源码部署包、Arduino上传包，Git忽略，均不含秘密和本机数据库 |

KISS：不引入推送、MQTT、数据库服务器、队列、RTC、显示器或日志平台。硬件正式／回退各保留独立的小头文件便于直接上传回退，暂不创建共享Arduino库。

## 3. 新闻与英文口播

新增两个模板：news“金融新闻”、actuarial“精算与保险新闻”。同时听三个范围时，添加news全球、news香港、actuarial各一；count为1～3，默认2。已有用户编排不自动插入新模块。

NewsConfig：scope=global/hong_kong、count、prompt、aliases。aliases是每行原名=播报名的文本。默认名称规则保留AIA、AXA、HSBC、PRU、PWC、EY、KPMG、股票代码／专业缩写，不一律换成公司中文名；Prudential→PRU、Donald Trump→特朗普。未知普通英文名称要求用常见中文译名，禁止猜股票代码；用户可改替换表。

出版方源：
- 全球：CNBC官方search订阅地址（全球id100727362、财经id10000664）；普通www.cnbc.com RSS实测403，未采用；BBC商业RSS。
- 香港：香港电台财经RSS、金管局公开press-releases JSON（lang=tc）。Prompt限定直接香港联系，不能用纯美国行情凑香港新闻。
- 精算：Artemis、Insurance Journal、SOA精算杂志、Reinsurance News及金管局。优先寿险、健康险、养老金、资本／准备金、监管、再保险、巨灾与模型，不选招聘广告／普通任命。

香港当天00:00以前才可入选，优先前一日00:00～24:00；金融最多回顾2天、精算7天。无日期／无时区RSS条目跳过，不假定时区。金管局只有日期，按香港日界处理。每源最多12条参与编辑；按URL去重，AI合并重复事件。窗口是发布时间，不是保证事件发生在昨天；只覆盖RSS仍保留的近期条目，不保证全天完整报道。

每源12秒超时，获取并发；单源失败在raw.source_errors／整体warning提示，其余源继续；全部失败报错，不用模型记忆填新闻。没有日期窗口内材料就播明确的无更新句。金管局偶尔HTTP失败已观察到，不能写成所有源始终可靠。

AI沿用OPENAI_BASE_URL／MODEL／KEY和chat.completions。普通AI接口不自动联网；真实订阅标题／摘要是唯一时事证据，不获取文章全文、不绕付费墙。源摘要去HTML并限500字符。system规定资料不能当指令，事实、简称、简体中文、条数与JSON引用。user给详细编辑Prompt、名称表、窗口与候选。生成JSON items，每条有ids和text；验有效id、重复id、count、每条最多160字符、英文单词／格式符号、回顾日期。失败自动纠正一次，仍失败报错。新闻AI默认最多1000tokens；其他模块300tokens；timeout45秒、无SDK自动重试，temperature0.4。

新闻测试本身已经包含AI，界面不展示第二层AI开关／变量区。返回source_text为最终新闻口播，raw有候选与selected_sources及错误，ai_messages为实际消息，ai_text为最终稿。AI引用id能提供追溯，不是自动事实核验；仍需用户读稿确认。自定义普通文本／HTTP英文不保证自动翻译，需模板或AI改写。

## 4. API与网页语义

原有：
GET/PUT /api/config（完整配置保存，不是patch）；
GET /api/modules/catalog；
POST /api/preview（当前编辑，不保存）；
POST /api/blocks/test（block、with_ai）；
GET /briefing（数据库编排生成JSON）；
GET /health（status、ai_configured）。

编排仍version/title/separator/blocks，最多30、id唯一。模块type=text/weather/stocks/http/news/actuarial；原ai.enabled/prompt保留。GET /briefing仍JSON，不让主板直接解析它。

设备：
- /device/time?mode=daily&hour=7&minute=15&board=...：v、now、sync、next、period、delay、drift按既定顺序ASCII；daily整点校时、period86400、delay0。旧test仍period120、delay10、5分钟校时。
- /device/time-speech?event=...：保留短测时间句，正式版不用。
- /device/briefing：首次立即503并后台生成，Retry-After30；就绪200，正文v=1、id=12位小写hex、parts=1～128。
- /device/briefing-part?id=...&part=0：零起始编号，纯UTF-8文本≤180字节。无效id422，过期／重启丢失id410，越界404。
- 旧/device/demo已删除，原按钮HTTP草图也删除。

服务端按香港日期＋保存配置的hash缓存。2026-10-11已部署动态预热：跟随daily校时中的hour/minute，计划前5分钟到后15分钟，每30秒预热；未登记时默认07:10～07:30。相同日期／配置共用固定稿；单生成任务，网页预览不写入设备缓存。更新配置会为下一次请求生成新稿，已发manifest的快照保持不变。快照内存保留3小时，最多8份；单服务进程，不使用多worker共享此缓存。最多128段／23040字节；过长明确失败不截断。空编排有简短提示。全模块error不发布设备稿；部分失败保留其他模块与网页同样兜底句。

200设备响应由PlainTextResponse提供Content-Length、Cache-Control:no-store；不启用gzip、chunked或跳转。manifest不会阻塞等AI，避免主板12秒正文等待耗尽。服务器重启丢快照，不做持久化播放记录。

## 5. 正式固件行为（源码已发布，主板未上传）

用户主板实际仍为时间短测版，8号=L2/R4用于启动／重新校时；不要把本地新版的立即播报功能当作主板已经具备。daily_briefing现为多按钮版本，SERVER_HOST=40.233.65.88、PORT=8086。默认每天香港07:15，EEPROM地址0～4保存设置。上电先读设置，再联网校时，每小时整点校时。

8号重置本地时钟／待播状态并重新校时，保留保存时间，不硬重启MCU。7号随时补听整个已保存编排，不只新闻；播报中不叠加。6号进入小时草稿从0加起，第一次为1，24次为0；1号确认HH:00立即保存并进入分钟阶段；5号每次+5至55再回0；1号保存HH:MM退出。只设小时可直接再按1号或等30秒退出。未确认草稿丢弃，已确认HH:00保留。普通状态1号朗读设置。快速连按保留最新语音提示，不重叠。

改时间即重排未来计划；今天已过／恰好达到则明天，补听按7号。EEPROM只在确认且内容变化时写，有签名／版本／范围／校验；错误回默认07:15。无RTC及播放记录，断电只保留设置，上电仍需首次联网。校正保留待播任务，断网只补一次；改时间主动重排。设定阶段不启动新的联网或定时播放；晨报进行中要先8号停止后续段落再设定。

按钮矩阵接线：L1→D7、L2→D8、R1→D9、R2→D10、R3→D11、R4→原D4；**原L2→GND必须移除**。按两列四行、左列1～4右列5～8假设编号；用户仅确认8号接点，其他键先用串口[KEY]核对，必要时修改KEY_NUMBERS。旧时间短测回退要恢复L2→GND。ESP D0/D1、语音D6、电平转换和供电沿用成功接线。矩阵5ms扫描、50ms防抖、长按不重复、完全松开后才接受下一键；AT/HTTP等待中也扫描，最多缓存39个事件，返回后处理，避免嵌套请求。

TTS等待每字符450ms＋1500ms为保守估算，无回传。8号／x不截断当前语音帧，仅停后续。每段≤180UTF-8字节，失败同序号30秒重试；manifest没稿503后30秒再取；410重取整稿可能重复已播段。快照3小时有效，下午补听可能重新生成而非逐字复用早上稿。串口115200：数字1～8代替实体按键，t=7，s状态，x停止。

## 6. Docker／数据／发布

Compose外部8086内部8000，命名卷vox-data:/app/data，restart unless-stopped，健康检查/health。镜像只复制后端和构建网页，.env／data／硬件／release／依赖安装目录不进上下文。Windows锁缺Linux Rollup可选二进制，Docker额外安装匹配Rollup版本与CPU架构的musl包，实际构建已通过。npm审计已修补source-map-js、shell-quote；shell-quote固定override1.11.0，审计0个已报告漏洞。

用户2026-10-08授权后，已通过SSH别名my连接ubuntu@40.233.65.88，在/home/ubuntu/Vox克隆上述GitHub仓库；主机Docker28.4、Compose2.39、aarch64。真实.env通过SCP迁移并chmod600；本机SQLite用backup生成一致副本后迁移，首启前docker compose cp写入vox-data卷。保存配置hash与本机一致，仍为text/weather/stocks/text，不自动加新闻。容器vox-vox-1健康，映射0.0.0.0:8086→8000，restart unless-stopped。没有停止或修改服务器已有其他项目。

服务器内部/health返回ok且ai_configured=true；网页200、模板6种、daily时间period86400／整点sync正确；全球／香港／精算新闻各实际生成成功；保存稿生成3段，每段≤180字节、有效UTF-8、Content-Length正确，无chunked。本机Vox容器及测试服务均未运行，其他项目容器保留。

10月8日检查记录（10月9日浏览器访问已恢复，未代改云规则）：公网地址http://40.233.65.88:8086/当时未验收成功：本机禁用代理直连8086仍超时，8085可达；服务器8086监听、INPUT/FORWARD允许、Docker端口规则允许、ufw未开启。疑似云VPC安全列表／网络安全组未放行8086，未访问或修改云控制台。需添加入站TCP目的端口8086（网页和设备使用时来源0.0.0.0/0），再从外部验证/health与device接口。不要改成HTTPS或给device跳登录页。香港UTC+8独立于加拿大系统时区，系统时钟本身需准确。

后续更新在服务器目录git pull --ff-only，再docker compose up -d --build；env和命名卷保留。变更.env后需重建容器使环境生效，git pull本身不会更新私密配置。

源码包不携带真实.env／密钥／本机数据库。首次空命名卷初始化默认编排。保留本机内容需私下迁移data/vox.db，在首次启动前docker compose create、docker compose cp ./data/vox.db vox:/app/data/vox.db、docker compose up -d。已有卷先备份，不覆盖，不删除卷。数据库可能包含用户HTTP请求头；不能公开分发。

当前仍无鉴权原型，网页/API公网保护由部署环境明确配置；device维持主板能访问的HTTP纯文本。未替用户选择账号／密码或新增复杂认证系统。此前网页批次已SSH部署；本批硬件源码／动态预热／语音反馈与等宽调整已获统一发布授权，结果见第10节。云规则未调整。

## 7. 清理及下一步

删除：ams1117_output_check、esp_listen_only、tts_hardware_serial_diag、button_voice_test、button_http_voice与重复parser；旧demo路由；仅缓存的tests、.pytest_cache、根__pycache__。保留正式版、已成功时间回退和配网桥，data/vox.db、.env、.venv、依赖与构建目录。后台运行检查使用隔离TEMP数据库／临时容器，不改本机编排。

下一步：
1. 在网页添加全球、香港、精算模块，确认Prompt／简称／条数，测试后保存；已有数据库不自动加模块。
2. 服务器部署、数据迁移及公网浏览器网页/API验证已完成；继续核对主板所在实际香港网络的device时间与分段接口可达。
3. 上传daily_briefing；先按按钮听完整稿，检查字母简称、分段是否重叠、source warning；然后验07:15及整点校时。
4. 过夜、短断网、服务器重启、设备断电和补听，记录实际出声延迟。失败先看SYNC／PART日志，不重新从电源／按钮测试开始。

用户希望简单、小步、保留成功实现。未请求不启动本机服务；不恢复pytest／日志平台。凭据只在授权范围私下使用／迁移，不能打印、提交或分发；区分实机、编译／软件检查与待验收。服务器旧批次部署已完成，后续推送／部署须用户明确要求；硬件上传尚未执行。

## 8. 2026-10-09网页修复

用户公网实测点击模板无反应。浏览器实际复现TypeError: crypto.randomUUID is not a function；旧实现只在安全上下文可用，localhost测试掩盖公网HTTP问题。App改用getRandomValues生成8字节随机ID，不改HTTP设备协议、不引入依赖。添加后选中新模块、滚动中间列表到该项并显示添加提示；仍需用户保存才写数据库。

桌面DOM顺序恢复模块库→模块列表→编辑，CSS比例1:1:1.6，当时前两栏最小260px、编辑最小440px。三栏54px标题对齐，各自滚动；库卡片和表单字号／留白加大。列表先显示模块及拖动／启停，再显示完整稿预览；移除列表重复的英文类型标签以给名称留空间。窄屏底部导航同步为模块／列表／编辑，选择或添加后进入编辑，关闭编辑返回列表。

验证使用服务器临时静态预览目录及现有API，未启动本机服务、未保存测试模块。公网HTTP六种模板均可添加，连续添加及重复新闻ID正常、自动选中、名称同步、启停、鼠标排序和390px手机导航通过；1000px两栏等宽且编辑更宽，无横向溢出。TypeScript与正式Vite构建通过。源码推送后服务器git pull并重建Vox容器，保留.env和数据卷；临时预览随后移除。硬件源码与播报计划无变动。

## 9. 2026-10-09多按钮与动态时间（当时待发布）

本地新增schedule_settings.h和keypad.h，改daily_briefing主程序及专用device_io/time_state。backend/device_time.py在daily请求时登记单块主板的播报时间，device_briefing.py按此时间预热，跨午夜窗口正确；时钟ASCII字段保持原格式。服务重启暂回07:15直到主板再次校时；任意时间按需生成一直可用。未新增API密钥、数据库服务或Arduino依赖。

验证：Leonardo实编23202flash、1690静态RAM、余870；TEMP C++检查07:20示例、小时单独确认、断电模拟、损坏校验／不重复写EEPROM、小时分钟与millis回绕、全部1440个目标时间与日界、多键／长按／抖动和39事件队列。Python临时数据库TestClient检查4个目标时间全天计划、跨午夜预热、daily登记而test不覆盖、无稿单任务503→200、固定id的UTF-8分段。未启动本机监听服务，不访问／更新服务器，不改真实保存配置，不上传硬件。

交付候选release/vox-daily-buttons-firmware.zip，含ino、5个h、README；旧vox-daily-firmware.zip仍是先前单按钮版。正式使用前按hardware/daily_briefing/README新增四根信号线并把原L2地线移到D8，逐个核对键号、听语音、断电保存，之后做定时／过夜实测。当时旧单按钮包尚保留；本次已移除避免混淆。当时GitHub／服务器停在22d769e网页修复版本，等待统一发布指令；2026-10-11用户已授权，最新状态见第10节。

## 10. 2026-10-11语音辅助与统一发布

用户授权将累计多按钮、EEPROM时间、动态服务端预热及本次语音辅助／两栏等宽全部推送并部署。新增8号开始校时／成功／失败提示；7号有稿直读、无稿提示等待，一次等待只自动提示一次、30秒静默重试；快照过期或网络失败有明确反馈。6／5朗读当前小时／分钟，1号朗读保存结果，非法步骤／编辑超时也反馈。快速连按仍保留最新提示；TTS不支持立即中断，无实机反馈回传，按估算读速串行发送，8号保留EEPROM时间。

网页桌面前两栏共用repeat(2,minmax(0,1fr))，相同分隔边框，编辑区1.6fr且最小440px；窄屏仍用原三页导航。无新增依赖／密钥或数据库结构。

验证：Leonardo24306字节flash（84%），1693字节静态RAM（66%），余867字节；实际草图的真实语音帧与模拟HTTP状态均通过。检查校时失败不误报成功、成功提示、503只提示一次、准备好直读正文、重复7不叠加、410重取、小时／分钟保存和EEPROM恢复。原矩阵／时间边界检查通过；临时数据库API检查四个动态时间全部1440分钟、跨午夜预热、test请求不覆盖daily设置、503→200及180字节分段；原六项后端检查和TypeScript／Vite构建通过。不启动本机监听服务，不改真实配置，不上传主板。

发布与验收：功能提交7bfc9cc已推送origin/main，SSH my在/home/ubuntu/Vox执行git pull --ff-only与docker compose up -d --build --wait，ARM64镜像构建成功、vox-vox-1健康、8086→8000。已有.env和vox-data卷保留，更新前后/api/config SHA256均为39d2dc2854d37c5cd1aaf4e09a3b5c12501b9de464ce63e441d2c59c27c28586；无需用户再次配置.env。公网/health与/device/time通过，实际取稿503→200并生成2个UTF-8段，逐段Content-Length与180字节上限正确、无chunked。公网浏览器1280px实测前两栏均355.5546875px、编辑568.890625px，无横向溢出，截图release/vox-web-equal-columns.png。没有启动本机Vox或修改其他Docker项目。固件包release/vox-daily-buttons-firmware.zip包含ino、五个h和操作README，用户仍须按接线表改线、核对键号、Arduino Leonardo上传并实机听测／断电保存；网站更新不会自动升级主板。

## 11. 2026-10-11新聊天入口（本地文档改动）

新增根目录AGENTS.md，集中长期约定、快速接手、文件导航、网页／API语义、新闻口播、设备协议、按键接线、验证与部署入口。状态快照注明历史日期，必须区分本地／GitHub／服务器／主板；后续聊天先读入口，再按任务查handoff相关章节，不必重读全部历史。README已链接入口，并修正本文仍称动态预热“本地新版”和旧固件包名的当前描述。

本次仅改文档，核对路径与命令、检查差异，不启动服务、不联网验收、不改功能／配置／固件。未commit、未推送GitHub或更新服务器；上一批发布授权已经完成，不延伸到本次。现有release源码包属于上一交付批次，未因本次本地文档修改重打包。

## 12. 2026-10-11设备日志、停顿排查与预取（本地待发布）

用户需要追查按日播报／校时／接口问题，并反映尾声前固定停顿、长稿停顿更多；最新确认主板已经使用上一交付daily_briefing（第10节的功能版），语音板HS-S77-PL只有TX／RX／VCC／GND，无BUSY。这个确认覆盖旧“仍是短测、未上传”的当前状态描述，不代表各按键接线或可靠性全已验收；历史章节保留当时事实。

新增backend/device_log.py：配置库旁独立device-log.db，记录香港日期的服务器生命周期、device请求／状态／耗时、校时计划、晨报生成及各模块结果，并存档实际正文／分段／估算等待。白名单query、错误类型及上游状态码，不记录headers、任意query、完整配置或原始私密错误正文；实际稿件仍可能私密，当前无鉴权原型未新增访问保护。保留30天、最多10000事件／200稿件，自动清理；存储故障不影响校时／取稿。沿用vox-data卷，无新.env项。新增SQLite journal忽略规则，真实vox.db保留未改。

网页右上角设备日志窗口：香港日期、手动刷新、分页、全文与分段、当天JSON下载。新增 `/api/device-logs`、`/api/device-logs/briefings/{id}`、`/api/device-logs/export`；不后台轮询，不影响三栏／编排。原稿件／模块测试继续显示完整用户可理解的错误，长期日志只保留安全摘要。

可确认的停顿机制：每180字节一帧，发完等字符数×450ms＋1500ms，没有TTS实际完成回执；旧程序等完后才执行AT准备、TCP及取下一段。60个纯中文字符估算28.5秒，实际较早读完会静音，长稿有更多分段。用户描述与此相符，未经实机时间测量不能作为最终定论；无证据是过热，也无可靠HS-S77-PL厂家TX协议可用。D5不支持Leonardo SoftwareSerial接收，不能直接把TX接上或套其他型号状态码。

本地候选固件复用192字节缓冲，在当前语音估算窗口中预取下一段；到期直接发送，晨报期间延后校时，提示覆盖缓冲取消预取并重取同段，8号清掉预取。**保守等待未缩短**，因此只改善段间联网等待，不能承诺停顿已消失。新增fw=log1、校时原因、触发类型，以及上一帧段号／millis／估算等待／完整fetch_ms／preload；末段估算结束后尽力报告一次 `/device/event?name=finished...`，不重试、不在两帧间单独请求。服务器收到／200／主板finished均不证明实际声音完成；完全断网无服务器记录。

验证：TypeScript／Vite构建通过；原六项后端检查通过；临时数据库进程内校时／非法参数、503→200、固定稿／180字节／Content-Length、410、遥测、历史／分页／全文／导出、跨重开持久化、30天／10000事件／200稿件清理、日志写失败仍200及敏感参数排除通过。全模块失败仍保留安全上游401并记失败，不产生成功存档。真实草图C++模拟通过播放中预取、不提前发送、下一帧发送不发HTTP、提示覆盖重取、末段报告、复位取消及原反馈／EEPROM场景。最坏路径与完整HTTP请求分别126／187字节，小于152／224缓冲。Leonardo实编25748flash（89%）、1614静态RAM（63%），余946；未实机上传／听测。网页新窗口仅构建／接口检查，本地file页面浏览器安全策略不允许打开，未绕过限制；实际页面交互待获授权发布后验收。

新增hardware/DIAGNOSTICS.md包含日志字段／排查顺序、软件停顿证据和限制、官方ESP32-S3集成音频板／DFRobot双语模块资料及绝缘底板／隔离柱／线束固定建议。推荐自然声音路线为服务端TTS音频缓存＋ESP32-S3播放，需另做音频API和新固件；不是本次已实现功能，现有AI聊天key不保证支持音频。

交付候选 `release/vox-daily-logs-firmware.zip`（ino、五个h、README），与当前源码逐项一致；上一发布 `vox-daily-buttons-firmware.zip`、`vox-server.zip` 保持原样。根AGENTS、README及硬件文档已同步。GitHub／服务器仍为上一批a8fc2fd，本次未commit／推送／SSH更新、不启动本机服务、不改私密配置、不上传硬件。下次获统一发布授权时先更新服务器验收日志，再上传候选并听测；旧主板也有服务器请求日志，详细遥测和预取需新固件。已有服务器.env无需重填。

## 13. 2026-10-18日志与预取统一发布

用户确认已经上传 `vox-daily-logs-firmware.zip`，明确授权将当前累计改动推送GitHub并更新服务器。固件源码固定访问40.233.65.88:8086；不改固件时主板请求服务器，本地可单独验证网页／后端，但实机联调使用服务器。后续只改网页／后端通常无需重新刷主板，不为调试来回换IP。

发布前重新核对工作区，原未提交改动全部属于上述本地批次；TypeScript／Vite构建、临时数据库校时／503→200／UTF-8分段／Content-Length／日志存档／导出通过。服务器工作区干净、HEAD为a8fc2fd，vox-vox-1已运行6天且健康。发布前保存配置响应SHA256为c6cf5c4faf197e840c960eb1c044ab78984dcdc30555ccd5489ef43cc4c3feef；只记录hash，不输出正文或真实.env。此次授权不包含代理上传硬件，不启动本机服务。

发布完成：功能提交8cb5d96推送origin/main，SSH my在/home/ubuntu/Vox快进拉取，docker compose up -d --build --wait --wait-timeout 120成功，ARM64镜像sha256:78f5dca5d59f25f0ca39a059dba6644c32c35f0a94331695749a070d85f2ea8b，vox-vox-1健康，8086→8000。既有.env和vox-data卷沿用；更新后服务器内及公网保存配置SHA256与上文一致，无需用户重配.env。随后仅提交／拉取发布记录等文档，运行镜像保持8cb5d96功能内容，未因文档再次重启。

公网直连验收：/health为ok且ai_configured=true；/device/time?mode=test返回原纯文本格式（选test避免覆盖实际主板保存时间对应的服务端预热计划）。manifest503→200，实际生成2段178／97字节，各段UTF-8、Content-Length、text/plain正确，无Transfer-Encoding。日志API、实际稿件全文、当天JSON附件导出通过；浏览器实际打开右上角设备日志、刷新、读取稿件并显示事件列表，截图release/vox-device-logs-deployed-20261018.png。此截图／GET请求由代理验收产生，不是实机完成证据；截至检查未出现fw=log1请求。用户已确认上传，但新固件出声／预取改善／末段finished还需主板发起后观察。

额外发现：本次生成中text／weather成功，news／actuarial均记录ai_http、upstream_status522；独立短文本AI模块测试同样返回“AI 服务 HTTP 522”。说明上游AI调用当前不可用，不能将本次2段接口成功称作新闻生成成功；现有失败提示保留在稿件中，未改用户编排、密钥、模型或供应商。已有快照按原3小时规则复用，未为清缓存重启服务；上游恢复后的新稿需要正常重新生成。后续排查先看日志中模块状态，再用网页模块测试核对当前供应商，不从主板接线重新开始。

本轮更新README、AGENTS、硬件说明的当前状态，确认程序地址始终是服务器，不需要用户再次刷主板。本地固件ZIP只同步操作文档，ino与五个h保持用户已上传版本；旧buttons包／server源码包保留原交付记录。没有启动本机监听／Docker、没有修改其他服务器项目，也没有代理上传硬件。
