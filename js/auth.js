/**
 * Gerenciamento de Autenticação do Usuário
 */

document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.getElementById('form-login');
  const btnLogout = document.getElementById('btn-logout');
  const viewLogin = document.getElementById('view-login');
  const appShell = document.getElementById('app-shell');
  const userEmailDisplay = document.getElementById('user-email-display');

  // Monitora alterações de autenticação
  auth.onAuthStateChanged((user) => {
    if (user) {
      // Usuário autenticado
      userEmailDisplay.textContent = user.email;
      viewLogin.classList.remove('active');
      viewLogin.classList.add('hidden');
      appShell.classList.remove('hidden');
      
      // Notifica login bem sucedido
      showToast(`Bem-vindo, ${user.email}`, 'info');
    } else {
      // Usuário deslogado
      userEmailDisplay.textContent = '';
      appShell.classList.add('hidden');
      viewLogin.classList.remove('hidden');
      viewLogin.classList.add('active');
    }

    if (typeof window.dismissSplashScreen === 'function') {
      window.dismissSplashScreen();
    }
  });

  // Evento de Login
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;

      try {
        await auth.signInWithEmailAndPassword(email, password);
        formLogin.reset();
      } catch (error) {
        console.error("Erro no login:", error);
        let mensagemErro = "Não foi possível realizar o login.";
        
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
          mensagemErro = "E-mail ou senha incorretos.";
        } else if (error.code === 'auth/invalid-email') {
          mensagemErro = "Formato de e-mail inválido.";
        } else if (error.code === 'auth/too-many-requests') {
          mensagemErro = "Muitas tentativas sem sucesso. Tente novamente mais tarde.";
        }
        
        showToast(mensagemErro, 'error');
      }
    });
  }

  // Evento de Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await auth.signOut();
        showToast("Sessão encerrada.", 'info');
      } catch (error) {
        console.error("Erro ao sair:", error);
        showToast("Erro ao encerrar sessão.", 'error');
      }
    });
  }
});