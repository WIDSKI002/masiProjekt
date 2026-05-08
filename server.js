const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');


const bcrypt = require('bcrypt');
const saltRounds = 10;

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'neondb_owner',          
  host: 'ep-divine-wind-amtd9qol-pooler.c-5.us-east-1.aws.neon.tech',   
  database: 'neondb',
  password: 'npg_wvg3HFRxT6bQ',    
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
app.get('/api/role', async (req, res) => {
  try {
      const result = await pool.query('SELECT * FROM role ORDER BY id');
      res.json(result.rows);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Blad serwera' });
  }
});
app.get('/uzytkownicy', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, imie, nazwisko, email,  data_utworzenia FROM uzytkownicy'
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/trenera', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT u.id, u.imie, u.nazwisko FROM uzytkownicy u JOIN uzytkownik_role ur ON u.id = ur.uzytkownik_id JOIN role r ON ur.rola_id = r.id WHERE r.nazwa = $1',
      ['Trener']
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/dodajSzkolenie', verifyToken, async (req, res) => {
  const { tytul, opis, limit_miejsc, cena, data_rozpoczecia, data_zakonczenia, status } = req.body;
  try {
    const allowedRoles = [1, 2, 3]; // admin, uczestnik, trener
    if (!allowedRoles.includes(req.user.rola)) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }

    const result = await pool.query(
      'INSERT INTO szkolenia (tytul, opis, trener_id, limit_miejsc, cena, data_rozpoczecia, data_zakonczenia, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, tytul, opis, limit_miejsc, cena, data_rozpoczecia, data_zakonczenia, status',
      [tytul, opis, req.user.userId, limit_miejsc, cena, data_rozpoczecia, data_zakonczenia, status || 'planowane']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/login', async (req, res) => {
  const { login, password } = req.body;
  const result = await pool.query(
    'SELECT * FROM uzytkownicy WHERE email = $1',
    [login]
  );
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
  }
  const isMatch = await bcrypt.compare(password, user.haslo);
  if (isMatch) {
    const r = await pool.query('SELECT rola_id FROM uzytkownik_role WHERE uzytkownik_id = $1',[user.id]);
    const payload = {
      userId: user.id,
      email: login,
      rola: r.rows[0].rola_id
    };
    
    const secret = process.env.JWT_SECRET || "key";
    const token = jwt.sign(payload, secret, {
      expiresIn: "1h"
    });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Nieprawidłowy login lub hasło' });
  }
});

app.post('/rejestracja', async (req, res) => {
  const { imie, nazwisko, email, password, rola } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userResult = await pool.query(
      'INSERT INTO uzytkownicy (imie, nazwisko, email, haslo) VALUES ($1, $2, $3, $4) RETURNING id',
      [imie, nazwisko, email, hashedPassword]
    ); 
    const roleResult = await pool.query(
      'INSERT INTO uzytkownik_role (uzytkownik_id, rola_id) VALUES ($1, $2)',
      [userResult.rows[0].id, rola]
    );
    res.json({ id: userResult.rows[0].id, message: 'Rejestracja pomyślna' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Brak tokena' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || "key";

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded; 
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Brak uprawnien' });
  }
}

app.get('/szkolenia', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT s.id, s.tytul, s.opis, s.limit_miejsc, s.cena, s.status, u.imie, u.nazwisko FROM szkolenia s LEFT JOIN uzytkownicy u ON s.trener_id = u.id'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/szkolenia/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT s.id, s.tytul, s.opis, s.limit_miejsc, s.cena, s.status, s.data_rozpoczecia, s.data_zakonczenia, u.imie, u.nazwisko, u.id as trener_id FROM szkolenia s LEFT JOIN uzytkownicy u ON s.trener_id = u.id WHERE s.id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Szkolenie nie znalezione' });
    }
    
    const program = await pool.query(
      'SELECT * FROM terminy_szkolen WHERE szkolenie_id = $1 ORDER BY termin',
      [id]
    );
    
    res.json({ ...result.rows[0], program: program.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.put('/szkolenia/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { tytul, opis, limit_miejsc, cena, status, data_rozpoczecia, data_zakonczenia } = req.body;
    
    const schResult = await pool.query('SELECT trener_id FROM szkolenia WHERE id = $1', [id]);
    if (schResult.rows.length === 0) {
      return res.status(404).json({ error: 'Szkolenie nie znalezione' });
    }
    
    if (req.user.rola !== 1 && req.user.userId !== schResult.rows[0].trener_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }

    const result = await pool.query(
      'UPDATE szkolenia SET tytul=$1, opis=$2, limit_miejsc=$3, cena=$4, status=$5, data_rozpoczecia=$6, data_zakonczenia=$7 WHERE id=$8 RETURNING *',
      [tytul, opis, limit_miejsc, cena, status, data_rozpoczecia, data_zakonczenia, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.delete('/szkolenia/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(' DELETE FROM  szkolenia WHERE id = $1 RETURNING *', [id]);
 
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

app.post('/sesje', verifyToken, async (req, res) => {
  try {
    const { szkolenie_id, data_sesji, lokalizacja } = req.body;

    const schResult = await pool.query('SELECT trener_id FROM szkolenia WHERE id = $1', [szkolenie_id]);
    if (schResult.rows.length === 0) {
      return res.status(404).json({ error: 'Szkolenie nie znalezione' });
    }
    
    const allowedRoles = [1, 2, 3]; // admin, user, trener
    if (!allowedRoles.includes(req.user.rola) && req.user.userId !== schResult.rows[0].trener_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'INSERT INTO sesje_szkolen (szkolenie_id, data_sesji, lokalizacja) VALUES ($1, $2, $3) RETURNING *',
      [szkolenie_id, data_sesji, lokalizacja]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/obecnosci', verifyToken, async (req, res) => {
  try {
    const { uzytkownik_id, termin_id, obecny } = req.body;

    const terminResult = await pool.query('SELECT szkolenie_id FROM terminy_szkolen WHERE id = $1', [termin_id]);
    const schResult = await pool.query('SELECT trener_id FROM szkolenia WHERE id = $1', [terminResult.rows[0].szkolenie_id]);
    
    if (req.user.rola !== 1 && req.user.userId !== schResult.rows[0].trener_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
  
    const existResult = await pool.query(
      'SELECT id FROM obecnosci WHERE uzytkownik_id = $1 AND termin_id = $2',
      [uzytkownik_id, termin_id]
    );
    
    let result;
    if (existResult.rows.length > 0) {
      result = await pool.query(
        'UPDATE obecnosci SET obecny = $1 WHERE uzytkownik_id = $2 AND termin_id = $3 RETURNING *',
        [obecny, uzytkownik_id, termin_id]
      );
    } else {
      result = await pool.query(
        'INSERT INTO obecnosci (uzytkownik_id, termin_id, obecny) VALUES ($1, $2, $3) RETURNING *',
        [uzytkownik_id, termin_id, obecny]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/obecnosci/:termin_id', verifyToken, async (req, res) => {
  try {
    const { termin_id } = req.params;
    
    const result = await pool.query(
      `SELECT 
          z.id as zapis_id,
          u.id as uzytkownik_id,
          u.imie,
          u.nazwisko,
          u.email,
          COALESCE(o.obecny, false) as obecny
       FROM zapisy z
       JOIN uzytkownicy u ON z.uzytkownik_id = u.id
       LEFT JOIN obecnosci o ON o.uzytkownik_id = u.id AND o.termin_id = $1
       WHERE z.szkolenie_id = (SELECT szkolenie_id FROM terminy_szkolen WHERE id = $1) AND z.status = 'aktywny'
       ORDER BY u.nazwisko`,
      [termin_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/certyfikaty', verifyToken, async (req, res) => {
  try {
    const { uzytkownik_id, szkolenie_id } = req.body;
    
    if (!uzytkownik_id || !szkolenie_id) {
      return res.status(400).json({ error: 'Brak wymaganych danych' });
    }

    const schResult = await pool.query('SELECT trener_id FROM szkolenia WHERE id = $1', [szkolenie_id]);
    if (schResult.rows.length === 0) {
      return res.status(404).json({ error: 'Szkolenie nie znalezione' });
    }
    
    if (req.user.rola !== 1 && req.user.userId !== schResult.rows[0].trener_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'INSERT INTO certyfikaty (uzytkownik_id, szkolenie_id, data_wydania) VALUES ($1, $2, CURRENT_DATE) RETURNING *',
      [uzytkownik_id, szkolenie_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'Certyfikat już istnieje' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/moje-certyfikaty', verifyToken, async (req, res) => {
  try {
    const uzytkownik_id = req.user.userId;
    const result = await pool.query(
      'SELECT c.id, c.data_wydania, s.tytul, s.opis, u.imie, u.nazwisko FROM certyfikaty c JOIN szkolenia s ON c.szkolenie_id = s.id LEFT JOIN uzytkownicy u ON s.trener_id = u.id WHERE c.uzytkownik_id = $1 ORDER BY c.data_wydania DESC',
      [uzytkownik_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/certyfikaty-trenera', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT c.id, c.data_wydania, s.tytul, u.imie, u.nazwisko FROM certyfikaty c JOIN szkolenia s ON c.szkolenie_id = s.id JOIN uzytkownicy u ON c.uzytkownik_id = u.id WHERE s.trener_id = $1 ORDER BY c.data_wydania DESC',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/platnosci/:zapis_id', verifyToken, async (req, res) => {
  try {
    const { zapis_id } = req.params;
    
    const zapis = await pool.query('SELECT uzytkownik_id FROM zapisy WHERE id = $1', [zapis_id]);
    if (zapis.rows.length === 0 || zapis.rows[0].uzytkownik_id !== req.user.userId) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'SELECT * FROM platnosci WHERE zapis_id = $1 ORDER BY data_platnosci DESC',
      [zapis_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/platnosci', verifyToken, async (req, res) => {
  try {
    const { zapis_id, kwota } = req.body;
    
    const zapis = await pool.query('SELECT uzytkownik_id FROM zapisy WHERE id = $1', [zapis_id]);
    if (zapis.rows.length === 0 || zapis.rows[0].uzytkownik_id !== req.user.userId) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'INSERT INTO platnosci (zapis_id, kwota, status, data_platnosci) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *',
      [zapis_id, kwota, 'zaplacone']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/powiadomienia', verifyToken, async (req, res) => {
  try {
    const uzytkownik_id = req.user.userId;
    const result = await pool.query(
      'SELECT * FROM powiadomienia WHERE uzytkownik_id = $1 ORDER BY data_wyslania DESC LIMIT 50',
      [uzytkownik_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/powiadomienia', verifyToken, async (req, res) => {
  try {
    const { uzytkownik_id, tresc, typ } = req.body;
    
    if (req.user.rola !== 1) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'INSERT INTO powiadomienia (uzytkownik_id, tresc, typ, data_wyslania) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING *',
      [uzytkownik_id, tresc, typ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/raporty/szkolenie/:szkolenie_id', verifyToken, async (req, res) => {
  try {
    const { szkolenie_id } = req.params;

    const schResult = await pool.query(
      'SELECT trener_id FROM szkolenia WHERE id = $1',
      [szkolenie_id]
    );

    if (schResult.rows.length === 0) {
      return res.status(404).json({ error: 'Szkolenie nie znalezione' });
    }

    const roleResult = await pool.query(
      `SELECT r.nazwa
       FROM uzytkownik_role ur
       JOIN role r ON ur.rola_id = r.id
       WHERE ur.uzytkownik_id = $1`,
      [req.user.userId]
    );

    const roleNames = roleResult.rows.map(r => r.nazwa);
    const isAdmin = roleNames.includes('Administrator');

    if (
      !isAdmin &&
      req.user.userId !== schResult.rows[0].trener_id
    ) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }

    const uczestnicy = await pool.query(
      `SELECT 
          u.id,
          u.imie,
          u.nazwisko,
          u.email,
          z.status,
          z.id AS zapis_id
       FROM zapisy z
       JOIN uzytkownicy u 
         ON z.uzytkownik_id = u.id
       WHERE z.szkolenie_id = $1`,
      [szkolenie_id]
    );

    const terminy = await pool.query(
      `SELECT 
          ts.id,
          ts.termin
       FROM terminy_szkolen ts
       WHERE ts.szkolenie_id = $1
       ORDER BY ts.termin`,
      [szkolenie_id]
    );

    const raport = [];

    for (const uczestnik of uczestnicy.rows) {

      const obecnosci = await pool.query(
        `SELECT 
            ts.termin,
            o.obecny
         FROM terminy_szkolen ts
         LEFT JOIN obecnosci o
           ON o.termin_id = ts.id
           AND o.uzytkownik_id = $1
         WHERE ts.szkolenie_id = $2
         ORDER BY ts.termin`,
        [uczestnik.id, szkolenie_id]
      );

      const certyfikat = await pool.query(
        `SELECT id
         FROM certyfikaty
         WHERE uzytkownik_id = $1
           AND szkolenie_id = $2`,
        [uczestnik.id, szkolenie_id]
      );

      raport.push({
        ...uczestnik,
        obecnosci: obecnosci.rows,
        ma_certyfikat: certyfikat.rows.length > 0
      });
    }

    res.json({
      szkolenie_id,
      terminy: terminy.rows,
      uczestnicy: raport
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/statystyki', verifyToken, async (req, res) => {
  try {
    if (req.user.rola !== 1) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const liczbaUzytkownikow = await pool.query('SELECT COUNT(*) as count FROM uzytkownicy');
    const liczbaSzkolen = await pool.query('SELECT COUNT(*) as count FROM szkolenia');
    const liczbaZapisow = await pool.query('SELECT COUNT(*) as count FROM zapisy WHERE status = $1', ['aktywny']);
    const liczbaCertyfikatow = await pool.query('SELECT COUNT(*) as count FROM certyfikaty');
    
    res.json({
      uzytkownicy: parseInt(liczbaUzytkownikow.rows[0].count),
      szkolenia: parseInt(liczbaSzkolen.rows[0].count),
      aktywneZapisy: parseInt(liczbaZapisow.rows[0].count),
      certyfikaty: parseInt(liczbaCertyfikatow.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/admin/uzytkownicy', verifyToken, async (req, res) => {
  try {
    if (req.user.rola !== 1) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'SELECT u.id, u.imie, u.nazwisko, u.email, u.data_utworzenia, ARRAY_AGG(r.nazwa) as role FROM uzytkownicy u LEFT JOIN uzytkownik_role ur ON u.id = ur.uzytkownik_id LEFT JOIN role r ON ur.rola_id = r.id GROUP BY u.id ORDER BY u.data_utworzenia DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.put('/admin/uzytkownicy/:id/rola', verifyToken, async (req, res) => {
  try {
    if (req.user.rola !== 1) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const { id } = req.params;
    const { rola_id } = req.body;
    
    await pool.query('DELETE FROM uzytkownik_role WHERE uzytkownik_id = $1', [id]);
    
    const result = await pool.query(
      'INSERT INTO uzytkownik_role (uzytkownik_id, rola_id) VALUES ($1, $2) RETURNING *',
      [id, rola_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/program-szkolenia', verifyToken, async (req, res) => {
  try {
    const { szkolenie_id, tytul, opis, kolejnosc } = req.body;
    
    const schResult = await pool.query('SELECT trener_id FROM szkolenia WHERE id = $1', [szkolenie_id]);
    if (req.user.rola !== 1 && req.user.userId !== schResult.rows[0].trener_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'INSERT INTO program_szkolenia (szkolenie_id, tytul, opis, kolejnosc) VALUES ($1, $2, $3, $4) RETURNING *',
      [szkolenie_id, tytul, opis, kolejnosc]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/moje-szkolenia', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM szkolenia WHERE trener_id = $1 ORDER BY id DESC',
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/terminy/:szkolenie_id', verifyToken, async (req, res) => {
  try {
    const { szkolenie_id } = req.params;
    const result = await pool.query(
      'SELECT id, szkolenie_id, termin FROM terminy_szkolen WHERE szkolenie_id = $1 ORDER BY termin',
      [szkolenie_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/terminy', verifyToken, async (req, res) => {
  try {
    const { szkolenie_id, termin } = req.body;
    
    const schResult = await pool.query('SELECT trener_id FROM szkolenia WHERE id = $1', [szkolenie_id]);
    if (schResult.rows.length === 0) {
      return res.status(404).json({ error: 'Szkolenie nie znalezione' });
    }
    if (req.user.rola !== 1 && req.user.userId !== schResult.rows[0].trener_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'INSERT INTO terminy_szkolen (szkolenie_id, termin) VALUES ($1, $2) RETURNING *',
      [szkolenie_id, termin]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.put('/terminy/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { termin } = req.body;
    
    const terminResult = await pool.query('SELECT szkolenie_id FROM terminy_szkolen WHERE id = $1', [id]);
    if (terminResult.rows.length === 0) {
      return res.status(404).json({ error: 'Termin nie znaleziony' });
    }
    const schResult = await pool.query('SELECT trener_id FROM szkolenia WHERE id = $1', [terminResult.rows[0].szkolenie_id]);
    if (req.user.rola !== 1 && req.user.userId !== schResult.rows[0].trener_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'UPDATE terminy_szkolen SET termin = $1 WHERE id = $2 RETURNING *',
      [termin, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.delete('/terminy/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const terminResult = await pool.query('SELECT szkolenie_id FROM terminy_szkolen WHERE id = $1', [id]);
    if (terminResult.rows.length === 0) {
      return res.status(404).json({ error: 'Termin nie znaleziony' });
    }
    const schResult = await pool.query('SELECT trener_id FROM szkolenia WHERE id = $1', [terminResult.rows[0].szkolenie_id]);
    if (req.user.rola !== 1 && req.user.userId !== schResult.rows[0].trener_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'DELETE FROM terminy_szkolen WHERE id = $1 RETURNING *',
      [id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/zapisy', verifyToken, async (req, res) => {
  try {
    const { szkolenie_id } = req.body;
    const uzytkownik_id = req.user.userId;
    
    if (!szkolenie_id) {
      return res.status(400).json({ error: 'Brak szkolenia_id' });
    }
    
    const schResult = await pool.query('SELECT id, limit_miejsc FROM szkolenia WHERE id = $1', [szkolenie_id]);
    if (schResult.rows.length === 0) {
      return res.status(404).json({ error: 'Szkolenie nie znalezione' });
    }
    
    const checkZapis = await pool.query(
      'SELECT id FROM zapisy WHERE uzytkownik_id = $1 AND szkolenie_id = $2',
      [uzytkownik_id, szkolenie_id]
    );
    if (checkZapis.rows.length > 0) {
      return res.status(400).json({ error: 'Już się zapisałeś na to szkolenie' });
    }
    
    const result = await pool.query(
      'INSERT INTO zapisy (uzytkownik_id, szkolenie_id, status) VALUES ($1, $2, $3) RETURNING *',
      [uzytkownik_id, szkolenie_id, 'aktywny']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.get('/moje-zapisy', verifyToken, async (req, res) => {
  try {
    const uzytkownik_id = req.user.userId;
    const result = await pool.query(
      `SELECT 
          z.id,
          z.status,
          z.data_zapisu,
          s.id as szkolenie_id,
          s.tytul,
          s.opis,
          s.data_rozpoczecia,
          s.data_zakonczenia,
          u.imie,
          u.nazwisko
       FROM zapisy z
       JOIN szkolenia s ON z.szkolenie_id = s.id
       LEFT JOIN uzytkownicy u ON s.trener_id = u.id
       WHERE z.uzytkownik_id = $1
       ORDER BY z.data_zapisu DESC`,
      [uzytkownik_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

app.post('/zapisy/:id/anuluj', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const uzytkownik_id = req.user.userId;
    
    const zapis = await pool.query('SELECT uzytkownik_id FROM zapisy WHERE id = $1', [id]);
    if (zapis.rows.length === 0) {
      return res.status(404).json({ error: 'Zapis nie znaleziony' });
    }
    if (zapis.rows[0].uzytkownik_id !== uzytkownik_id) {
      return res.status(403).json({ error: 'Brak uprawnien' });
    }
    
    const result = await pool.query(
      'UPDATE zapisy SET status = $1 WHERE id = $2 RETURNING *',
      ['anulowany', id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send('API działa 🚀');
});
app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});
