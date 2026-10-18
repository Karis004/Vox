# 硬件与成功接线

Leonardo + ESP-01S + HS-S77-PL。按钮联网与约10分钟时间短测已实机通过；旧daily_briefing实际播报存在段间停顿。2026-10-18用户确认已经上传新增预取／日志遥测固件，配套服务器已更新；新版本停顿改善尚待听测。语音板有TX、RX、VCC、GND，没有BUSY；当前程序仅发送，不读取TX。停顿诊断、自然语音候选和安装整理见 [DIAGNOSTICS.md](DIAGNOSTICS.md)。

## 保留程序

| 目录 | 用途 |
| --- | --- |
| daily_briefing | 多按钮正式版，上电自动启动、每小时校时、EEPROM每日时间（默认07:15）；1/5/6设时间、7补听、8重置校时；需新增按钮接线 |
| time_http_voice | 已验证时间短测回退，正文仍时间测试 |
| esp_at_bridge | 更换ESP保存的2.4GHz Wi-Fi，115200 |

早期供电ADC、监听、单机按钮、临时TTS串口和重复按钮HTTP草图已删除。

## 逐根接线

以下为已成功的旧单按钮线路，时间短测回退沿用。多按钮正式版仅调整按钮板六根线，见下方说明；ESP／语音／供电保留。分线节点按面包板现有相通位置确认。独立USB5V与Leonardo5V正极不互连，共地。

| 从哪里 | 接到哪里 |
| --- | --- |
| Leonardo供电／电脑数据USB | Leonardo USB口 |
| 独立USB充电头 | 红黑取电线USB头 |
| 取电线红色正极 | 独立5V分线节点 |
| 取电线黑色负极 | 公共GND节点 |
| 独立5V分线节点 | AMS1117 IN |
| 公共GND节点 | AMS1117 GND |
| AMS1117 OUT | 3.3V分线节点 |
| 3.3V分线节点 | ESP 3V3 |
| 3.3V分线节点 | ESP EN |
| 公共GND节点 | ESP GND |
| 独立5V分线节点 | 语音模块VCC |
| 公共GND节点 | 语音模块GND |
| Leonardo GND | 公共GND节点 |
| 3.3V分线节点 | 电平转换板VCCA |
| Leonardo自身5V | 电平转换板VCCB |
| 公共GND节点 | 电平转换板GND |
| Leonardo D1/TX1 | 电平转换板B0 |
| 电平转换板A0 | ESP RX |
| ESP TX | Leonardo D0/RX1 |
| Leonardo D6 | 语音模块RX |
| 按钮板L2 | 公共GND节点 |
| 按钮板R4 | Leonardo D4 |
| 配套喇叭插头 | 语音板喇叭插座 |

多按钮正式版：**先移除旧L2→GND，改接L2→D8**；L1→D7、R1→D9、R2→D10、R3→D11；原R4→D4保留。按钮板不再单独接GND。8号接点已确认，其余按键编号通过串口 `[KEY]` 核对。操作说明和完整接线表见 [daily_briefing/README.md](daily_briefing/README.md)。回退旧短测需恢复L2→GND。

转换板A0不是Leonardo模拟A0；TTS TX未接；ESP RST/IO0/IO2不由固件控制，不沿用旧D2/D3接法。B0503S的303mA模块不用于ESP。

USB Serial、ESP Serial1、TTS SoftwareSerial均115200。SoftwareSerial(5,6)发送脚D6，D5不用。发送音量[v7]及UTF-8 0x05帧，不用println代替。语音板能读字母但不能正常读单词，新闻保留熟悉简称并改写英文。无TTS回传，结束是估算，须听测。

## 换Wi-Fi

仅换网时上传esp_at_bridge/esp_at_bridge.ino，监视器115200、Both NL & CR。AT有OK后用AT+CWMODE=1、AT+CWJAP配置你的2.4GHz网络，AT+CIFSR检查IP。密码只在本地监视器输入，不写源码／交接。

连好网络后重新上传正式版。主板不需和加拿大服务器同一局域网；公网8086，日期香港UTC+8。

