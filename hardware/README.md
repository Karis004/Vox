# 硬件与成功接线

Leonardo + ESP-01S + HS-S77-PL。按钮联网与约10分钟时间短测已实机通过。2026-10-08新增正式晨报，软件检查完成，尚待上传听测。

## 保留程序

| 目录 | 用途 |
| --- | --- |
| daily_briefing | 正式版，上电自动启动、每小时校时、香港07:15播网页晨报，40.233.65.88:8086 |
| time_http_voice | 已验证时间短测回退，正文仍时间测试 |
| esp_at_bridge | 更换ESP保存的2.4GHz Wi-Fi，115200 |

早期供电ADC、监听、单机按钮、临时TTS串口和重复按钮HTTP草图已删除。

## 逐根接线

沿用成功线路，不需重插。分线节点按面包板现有相通位置确认。独立USB5V与Leonardo5V正极不互连，共地。

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

转换板A0不是Leonardo模拟A0；TTS TX未接；ESP RST/IO0/IO2不由固件控制，不沿用旧D2/D3接法。B0503S的303mA模块不用于ESP。

USB Serial、ESP Serial1、TTS SoftwareSerial均115200。SoftwareSerial(5,6)发送脚D6，D5不用。发送音量[v7]及UTF-8 0x05帧，不用println代替。语音板能读字母但不能正常读单词，新闻保留熟悉简称并改写英文。无TTS回传，结束是估算，须听测。

## 换Wi-Fi

仅换网时上传esp_at_bridge/esp_at_bridge.ino，监视器115200、Both NL & CR。AT有OK后用AT+CWMODE=1、AT+CWJAP配置你的2.4GHz网络，AT+CIFSR检查IP。密码只在本地监视器输入，不写源码／交接。

连好网络后重新上传正式版。主板不需和加拿大服务器同一局域网；公网8086，日期香港UTC+8。

