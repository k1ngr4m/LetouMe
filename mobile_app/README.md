# LetouMe Mobile

`LetouMe Mobile` 是面向普通用户的 Flutter 独立 App 骨架，复用现有后端 API，聚焦以下首期能力：

- 登录与登录态恢复
- 当前预测总览
- 历史开奖/预测
- 模型详情
- 我的投注
- 消息中心
- 规则说明
- 个人中心

## 技术栈

- `flutter_riverpod`
- `go_router`
- `dio`
- `shared_preferences`
- `flutter_secure_storage`
- `fl_chart`

## 目录

```text
mobile_app/
  lib/
    app/
    core/
    shared/
    features/
```

## 首期页面

- `登录`
- `首页预测`
- `历史记录`
- `模型详情`
- `我的投注`
- `消息中心`
- `规则说明`
- `个人中心`

## 模块约定

- `app/`：应用入口、路由、启动流程
- `core/`：配置、主题、网络、存储、常量
- `shared/`：跨功能共享的模型、Provider、壳层组件
- `features/`：按业务域拆分页面、状态和数据访问

## 快速开始

1. 安装 Flutter 3.24+
2. 进入目录：`cd mobile_app`
3. 获取依赖：`flutter pub get`
4. 指定后端地址后启动：

```bash
flutter run --dart-define=LETOUME_API_BASE_URL=http://127.0.0.1:8000/api
```

> 真机或模拟器不要直接依赖 `localhost`。  
> Android 模拟器通常改为 `http://10.0.2.2:8000/api`，iOS Simulator 可继续用 `127.0.0.1`。

## 当前状态

- 已提供首期页面骨架、路由、底部导航、主题与状态管理模板
- 已接通 `登录`、`当前预测`、`历史预测列表` 三类真实接口
- 已接通 `历史预测详情`，历史列表可下钻到单期详情
- 模型详情页已改为使用真实 `当前预测` 数据展示目标期和预测组合
- 已接通 `消息中心` 列表、未读数和已读操作
- 已接通 `我的投注` 列表与汇总数据
- 已新增 `我的投注详情`，支持从列表进入查看详情
- 已支持 `大乐透普通投注` 的移动端编辑与更新提交，复杂玩法暂保持只读
- 鉴权依赖后端 Session Cookie，移动端通过 `dio + cookie_jar` 维持会话
- 后台管理页未纳入移动端范围，继续保留在 Web 端
