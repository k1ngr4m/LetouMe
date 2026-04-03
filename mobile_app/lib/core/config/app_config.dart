class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    this.appName = 'LetouMe Mobile',
  });

  final String appName;
  final String apiBaseUrl;

  static const current = AppConfig(
    apiBaseUrl: String.fromEnvironment(
      'LETOUME_API_BASE_URL',
      defaultValue: 'http://localhost:8000/api',
    ),
  );
}
