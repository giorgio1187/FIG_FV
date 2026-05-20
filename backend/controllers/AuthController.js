const bcrypt = require('bcryptjs');
const User = require('../models/User');

class AuthController {
  constructor(db) {
    this.db = db;
  }

  async login(username, password) {
    try {
      const user = new User({ username });
      const foundUser = await user.findByUsername(this.db);

      if (!foundUser) {
        return { success: false, error: 'Credenciales inválidas' };
      }

      if (!foundUser.is_active) {
        return { success: false, error: 'Usuario desactivado. Contacte al administrador.' };
      }

      const validPassword = await bcrypt.compare(password, foundUser.password);

      if (!validPassword) {
        return { success: false, error: 'Credenciales inválidas' };
      }

      return {
        success: true,
        user: foundUser.toSafeObject()
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Error en el servidor' };
    }
  }

  async register(userData) {
    try {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = new User({
        username: userData.username,
        password: hashedPassword,
        name: userData.name,
        role: userData.role || 'waiter',
        station: userData.station || ''
      });

      const errors = user.validate();
      if (errors.length > 0) {
        return { success: false, errors };
      }

      const existing = await user.findByUsername(this.db);
      if (existing) {
        return { success: false, error: 'El nombre de usuario ya existe' };
      }

      const saved = await user.save(this.db);
      return { success: true, user: saved.toSafeObject() };
    } catch (error) {
      console.error('Register error:', error);
      return { success: false, error: 'Error al registrar usuario' };
    }
  }

  async getSession(userId) {
    const user = new User({ id: userId });
    const found = await user.findById(this.db);

    if (found && found.is_active) {
      return { success: true, user: found.toSafeObject() };
    }
    return { success: false, error: 'Sesión inválida' };
  }

  async changePassword(userId, oldPassword, newPassword) {
    const user = new User({ id: userId });
    const found = await user.findById(this.db);

    if (!found) {
      return { success: false, error: 'Usuario no encontrado' };
    }

    const validOld = await bcrypt.compare(oldPassword, found.password);
    if (!validOld) {
      return { success: false, error: 'Contraseña actual incorrecta' };
    }

    if (newPassword.length < 6) {
      return { success: false, error: 'Nueva contraseña debe tener al menos 6 caracteres' };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    found.password = hashedPassword;
    await found.update(this.db);

    return { success: true, message: 'Contraseña actualizada' };
  }
}

module.exports = AuthController;