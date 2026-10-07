# 正式晨报固件

解压vox-daily-firmware.zip，Arduino IDE打开daily_briefing/daily_briefing.ino，选择Arduino Leonardo及串口上传。同目录三个.h一起保留，不需额外Arduino库。

默认40.233.65.88:8086；香港07:15每天播报；整点每小时校时；上电自动启动。先部署服务器，再上传。沿用成功接线。

按钮／t即时播保存编排，s看状态，x停止后续段落。115200。播放中按钮不重播。换Wi-Fi先用../esp_at_bridge配置ESP，密码不写入固件。

/device/time?mode=daily&hour=7&minute=15校时；/device/briefing取id与段数；/device/briefing-part?id=...&part=0按零起始序号取稿。每段最多180 UTF-8字节，发送后等估算播放时间；失败30秒重试同一段。服务器重启快照失效时重新取稿，可能重复已读段。

首次校时到／超过07:15等次日，当天补听按按钮。断电无RTC或持久化进度。整稿发送且估算播放结束后推进计划，积压只补一次。

编译通过：20376字节flash、1618字节静态RAM，余942字节栈／局部变量。未实机上传／听测／过夜。HTTP不支持HTTPS、跳转、压缩、chunked。部署迁移见根README。
