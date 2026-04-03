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
4. 启动应用：`flutter run`

## 当前状态

- 已提供首期页面骨架、路由、底部导航、主题与状态管理模板
- 数据层目前为本地示例/占位实现，可逐步替换为真实接口
- 后台管理页未纳入移动端范围，继续保留在 Web 端
