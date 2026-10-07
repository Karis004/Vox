# Vox 项目交接

更新：2026-10-08；目录C:/Users/28623/Documents/ForFun/Vox。当前目标：网页编排真实内容，服务器生成中文晨报，Leonardo每天香港07:15主动请求并分段朗读。加拿大服务器指定40.233.65.88，网页和设备统一外部HTTP端口8086。

## 新聊天摘要

先读本文和README。React18 + TypeScript5.6 + Vite6，FastAPI + SQLite，Leonardo + ESP-01S + HS-S77-PL。旧按钮联网、混合文字有声音、约10分钟校时短测已实机通过；语音板实际不能正确读英文单词，只能逐字母，因此新增新闻按熟悉简称与中文词改写。当前正式源码hardware/daily_briefing：上电自动启动、每小时整点校时、每天香港07:15读网页已保存的编排，按钮即时播放，40.233.65.88:8086。新正式版已AVR编译、Docker及本地协议验证，尚未上传或公网／过夜实测。旧time_http_voice独立保留作已验证回退，esp_at_bridge作配网。早期其他草图、旧demo接口和残留pytest缓存已删除。现有数据库与.env保留，不读取／复制秘密。不要擅自启动5173、部署加拿大服务器、上传固件或宣称未做过的实机验证。

## 1. 当前进度与证据

| 部分 | 状态 |
| --- | --- |
| 旧ESP双向AT、Wi-Fi、按钮HTTP→语音 | 用户已实机确认 |
| 混合文字 | 用户确认有声音；最新确认英文单词不能正常发音，不能以早期混合稿测试推定支持英文 |
| 旧时间短测 | 用户运行约10分钟无异常；不是过夜／断网验收 |
| 网页原有编排、保存、模块／AI测试 | 已有；本次继续保留 |
| 金融＋精算新闻模板 | 已实现；全球、香港、精算均用真实来源与现有AI生成成功 |
| 网站保存内容→设备分段接口 | 已实现；本地容器实际HTTP/1.0及C++解析通过 |
| 正式07:15每日、整点校时 | 源码与软件验证完成，未上传／实机听测 |
| Docker8086 | 实际镜像构建、隔离容器网页/API检查通过；未部署加拿大 |
| 公网跨网、准确出声时间、过夜、多日／断电 | 待用户部署上传后验证 |

临时检查用TEMP中的Python unittest和C++，没有pytest或新增测试环境。UTF-8随机长稿重组、全年边界相关日（10月8日、12月31日）各1440分钟的每日计划、调快调慢／回绕／积压、快照冻结／配置变更、错误源／日期过滤／英文输出拒绝、真实容器长稿17段和每种分包长度已检查。正式AVR：20376字节flash、1618字节静态RAM，余942字节栈／局部变量。软件结果不等于实际喇叭完成报告。

## 2. 架构与代码

| 文件 | 责任 |
| --- | --- |
| frontend/src/App.tsx | 当前／保存配置、增删、预览／保存；防异步结果覆盖新的编辑 |
| components/Inspector.tsx | 原有文本、变量、HTTP、AI；新闻范围／条数／Prompt／名称表／引用测试 |
| components/ModuleLibrary.tsx、Canvas.tsx、SortableBlock.tsx | 模板库、顺序、整体稿、拖动与开关 |
| types.ts、icons.tsx、styles.css | 六种模块类型／图标／布局；手机断点1000与选择逻辑一致 |
| backend/main.py | API、构建网页、lifespan预生成任务；不存在的api/device不回HTML |
| backend/models.py | 编排模型；新增news/actuarial与NewsConfig校验 |
| backend/defaults.py | 原有默认编排、六种模板；不改数据库中的旧编排 |
| backend/news.py | 固定来源、日期筛选、详细默认Prompt、引用和口播输出检查 |
| backend/speech.py | 设备读法规则及名称替换，百分比口播 |
| backend/executor.py | 来源／模板／AI、并发有序合稿、模块错误隔离；新闻内部AI与其他AI共享配置 |
| backend/device_briefing.py | 07:10预生成、不可变快照、180字节UTF-8分段 |
| backend/device_time.py | 香港时间与test/daily计划；daily默认07:15 |
| backend/template.py | 日期UTC+8、变量替换和JSON路径 |
| backend/repository.py | SQLite一份配置，连接按作用域提交并显式关闭 |
| backend/settings.py | .env与环境变量配置 |
| hardware/daily_briefing | 新正式固件，自含3个头文件 |
| hardware/time_http_voice | 已实机通过的独立时间短测回退 |
| hardware/esp_at_bridge | ESP更换Wi-Fi |
| scripts/ | npm自动准备／调用.venv |
| data/vox.db | 原用户保存数据，保留 |
| Dockerfile、docker-compose.yml | 多阶段构建、单服务、8086:8000、命名卷 |
| release/vox-server.zip、vox-daily-firmware.zip | 源码部署包、Arduino源文件上传包，均不含秘密和本机数据库 |

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

服务端按香港日期＋保存配置的hash缓存，07:10～07:30每30秒预热。相同日期／配置共用固定稿；单生成任务，网页预览不写入设备缓存。更新配置会为下一次请求生成新稿，已发manifest的快照保持不变。快照内存保留3小时，最多8份；单服务进程，不使用多worker共享此缓存。最多128段／23040字节；过长明确失败不截断。空编排有简短提示。全模块error不发布设备稿；部分失败保留其他模块与网页同样兜底句。

200设备响应由PlainTextResponse提供Content-Length、Cache-Control:no-store；不启用gzip、chunked或跳转。manifest不会阻塞等AI，避免主板12秒正文等待耗尽。服务器重启丢快照，不做持久化播放记录。

## 5. 正式硬件行为

daily_briefing默认SERVER_HOST=40.233.65.88、SERVER_PORT=8086、HK_TIME_HOUR=7、HK_TIME_MINUTE=15。HOST不含http://或路径。同目录h必须一起复制，用IDE选择Leonardo上传。源文件zip内目录名daily_briefing，直接打开ino。

上电自动工作，约2秒后校时，不依赖USB串口打开或按钮。首次成功前不播报；每小时整点校时，失败30秒重试。本地millis计时、回绕、校正补偿≤5秒；校正保留未播计划。首次校时已到／超过07:15，等次日，不自动判断漏播；当天补听按钮。

按钮或t即时播保存晨报，播放中忽略重复；s状态、x停止后续任务。每日到期与手动请求同时出现以每日为主；手动整稿跨过每日时刻会推进每日计划，避免紧接着重复整稿。断网待播任务保留，恢复只补一次，跳过积压。

每段成功完整收取后才发TTS；下一段等每字符450ms＋1500ms保守估算，不是设备回传确认。传输保持Serial1的ESP收包与SoftwareSerial语音分时，RAM不放整稿。失败同序号重试；410清快照重取整稿，会重复已播段。设备断电失进度；无RTC／持久化去重。

接线见hardware/README，每行一根。D0/D1对应ESP，D1经电平转换；D6→语音RX；D4按钮；共地、独立两路5V正端不互连。实际旧松脱问题为ESP TX→D0，接好后通过，不重新推定电源坏。TTS音量[v7]、115200、UTF-8标记0x05，普通英文词不能准确读。

## 6. Docker／数据／发布

Compose外部8086内部8000，命名卷vox-data:/app/data，restart unless-stopped，健康检查/health。镜像只复制后端和构建网页，.env／data／硬件／release／依赖安装目录不进上下文。Windows锁缺Linux Rollup可选二进制，Docker额外安装匹配Rollup版本与CPU架构的musl包，实际构建已通过。npm审计已修补source-map-js、shell-quote；shell-quote固定override1.11.0，审计0个已报告漏洞。

服务器解压源码包，单独准备.env，docker compose up -d --build。公网地址http://40.233.65.88:8086/，允许云／主机TCP8086。不要改成HTTPS或给device跳登录页。香港UTC+8独立于加拿大系统时区，系统时钟本身需准确。

源码包不携带真实.env／密钥／本机数据库。首次空命名卷初始化默认编排。保留本机内容需私下迁移data/vox.db，在首次启动前docker compose create、docker compose cp ./data/vox.db vox:/app/data/vox.db、docker compose up -d。已有卷先备份，不覆盖，不删除卷。数据库可能包含用户HTTP请求头；不能公开分发。

当前仍无鉴权原型，网页/API公网保护由部署环境明确配置；device维持主板能访问的HTTP纯文本。未替用户选择账号／密码或新增复杂认证系统。本轮没有SSH、云防火墙／代理修改或实际发布。

## 7. 清理及下一步

删除：ams1117_output_check、esp_listen_only、tts_hardware_serial_diag、button_voice_test、button_http_voice与重复parser；旧demo路由；仅缓存的tests、.pytest_cache、根__pycache__。保留正式版、已成功时间回退和配网桥，data/vox.db、.env、.venv、依赖与构建目录。后台运行检查使用隔离TEMP数据库／临时容器，不改本机编排。

下一步：
1. 在网页添加全球、香港、精算模块，确认Prompt／简称／条数，测试后保存；已有数据库不自动加模块。
2. 用户部署8086容器，迁移保存配置，验证health、daily时间、manifest／首段的实际头；核对外部香港网络可达。
3. 上传daily_briefing；先按按钮听完整稿，检查字母简称、分段是否重叠、source warning；然后验07:15及整点校时。
4. 过夜、短断网、服务器重启、设备断电和补听，记录实际出声延迟。失败先看SYNC／PART日志，不重新从电源／按钮测试开始。

用户希望简单、小步、保留成功实现。未请求不启动5173或额外占用已有8000；不恢复pytest／日志平台。不复制凭据；区分实机、编译／软件检查与待验收。不擅自远程发布或上传硬件。
