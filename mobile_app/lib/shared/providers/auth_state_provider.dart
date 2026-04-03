import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/data/models/auth_user.dart';

class AuthState {
  const AuthState({
    required this.isLoggedIn,
    required this.isInitializing,
    this.displayName,
    this.user,
  });

  final bool isLoggedIn;
  final bool isInitializing;
  final String? displayName;
  final AuthUser? user;

  AuthState copyWith({
    bool? isLoggedIn,
    bool? isInitializing,
    String? displayName,
    AuthUser? user,
  }) {
    return AuthState(
      isLoggedIn: isLoggedIn ?? this.isLoggedIn,
      isInitializing: isInitializing ?? this.isInitializing,
      displayName: displayName ?? this.displayName,
      user: user ?? this.user,
    );
  }
}

class AuthStateNotifier extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState(isLoggedIn: false, isInitializing: true);

  void signIn(String displayName) {
    state = state.copyWith(isLoggedIn: true, isInitializing: false, displayName: displayName);
  }

  void signOut() {
    state = const AuthState(isLoggedIn: false, isInitializing: false);
  }

  void setUser(AuthUser user) {
    state = state.copyWith(
      isLoggedIn: true,
      isInitializing: false,
      displayName: user.nickname.isNotEmpty ? user.nickname : user.username,
      user: user,
    );
  }

  void finishBootstrap() {
    state = state.copyWith(isInitializing: false);
  }
}

final authStateProvider = NotifierProvider<AuthStateNotifier, AuthState>(AuthStateNotifier.new);
