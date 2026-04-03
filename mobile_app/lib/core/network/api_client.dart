import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';

import '../config/app_config.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient({Dio? dio}) : _dio = dio ?? Dio(_options) {
    _dio.interceptors.add(CookieManager(_cookieJar));
    _dio.interceptors.add(
      InterceptorsWrapper(
        onError: (error, handler) {
          final response = error.response;
          final detail = response?.data is Map<String, dynamic> ? response?.data['detail']?.toString() : null;
          handler.reject(
            DioException(
              requestOptions: error.requestOptions,
              response: error.response,
              type: error.type,
              error: ApiException(detail ?? '请求失败', statusCode: response?.statusCode),
            ),
          );
        },
      ),
    );
  }

  final Dio _dio;
  static final PersistCookieJar _cookieJar = PersistCookieJar(
    ignoreExpires: false,
    storage: FileStorage('${Directory.systemTemp.path}/letoume_mobile_cookies'),
  );
  static final BaseOptions _options = BaseOptions(
    baseUrl: AppConfig.current.apiBaseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
    sendTimeout: const Duration(seconds: 15),
    headers: const {
      'Content-Type': 'application/json',
    },
  );

  Dio get raw => _dio;

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final response = await _dio.post<Map<String, dynamic>>(path, data: data ?? const {});
      return response.data ?? <String, dynamic>{};
    } on DioException catch (error) {
      final cause = error.error;
      if (cause is ApiException) {
        throw cause;
      }
      throw ApiException('网络请求失败', statusCode: error.response?.statusCode);
    }
  }

  Future<void> clearCookies() async {
    await _cookieJar.deleteAll();
  }
}
