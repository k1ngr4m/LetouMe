import 'package:flutter_riverpod/flutter_riverpod.dart';

class AuthState {
  const AuthState({
    required this.isLoggedIn,
    this.displayName,
  });

  final bool isLoggedIn;
  final String? displayName;

  AuthState copyWith({
    bool? isLoggedIn,
    String? displayName,
  }) {
    return AuthState(
      isLoggedIn: isLoggedIn ?? this.isLoggedIn,
      displayName: displayName ?? this.displayName,
    );
  }
}

class AuthStateNotifier extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState(isLoggedIn: false);

  void signIn(String displayName) {
    state = state.copyWith(isLoggedIn: true, displayName: displayName);
  }

  void signOut() {
    state = const AuthState(isLoggedIn: false);
  }
}

final authStateProvider = NotifierProvider<AuthStateNotifier, AuthState>(AuthStateNotifier.new);
