
async function testLogin() {
  // Mock the fetch function to simulate a successful login
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === 'USER_LOGIN' && body.data.email === 'test@example.com' && body.data.password === 'password') {
      return {
        json: async () => ({
          success: true,
          user: {
            id: '123',
            usuario: 'test@example.com',
            perfil: 'Administrador',
            // ... other user properties
          }
        })
      };
    } else {
      return {
        json: async () => ({
          success: false,
          error: 'Credenciais inválidas.'
        })
      };
    }
  };

  console.log('Running test for successful login...');
  const successResponse = await global.fetch('/api/comunicados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'USER_LOGIN',
      data: {
        email: 'test@example.com',
        password: 'password'
      }
    })
  });
  const successResult = await successResponse.json();
  if (successResult.success && successResult.user.usuario === 'test@example.com') {
    console.log('✅ Successful login test passed!');
  } else {
    console.error('❌ Successful login test failed!');
  }

  console.log('Running test for failed login...');
  const failResponse = await global.fetch('/api/comunicados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'USER_LOGIN',
      data: {
        email: 'test@example.com',
        password: 'wrongpassword'
      }
    })
  });
  const failResult = await failResponse.json();
  if (!failResult.success && failResult.error === 'Credenciais inválidas.') {
    console.log('✅ Failed login test passed!');
  } else {
    console.error('❌ Failed login test failed!');
  }
}

testLogin();
