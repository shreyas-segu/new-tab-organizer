const Generator = {
  _FIRST_NAMES: ['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda','David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Christopher','Karen','Charles','Lisa','Daniel','Nancy','Matthew','Betty','Anthony','Margaret','Mark','Sandra','Donald','Ashley','Steven','Dorothy','Andrew','Kimberly','Paul','Emily','Joshua','Donna','Kenneth','Michelle','Kevin','Carol','Brian','Amanda','George','Melissa','Timothy','Deborah','Ronald','Stephanie','Edward','Rebecca','Jason','Sharon','Jeffrey','Laura','Ryan','Cynthia','Jacob','Kathleen','Gary','Amy','Nicholas','Angela','Eric','Shirley','Jonathan','Anna','Stephen','Brenda','Larry','Pamela','Justin','Emma','Scott','Nicole','Brandon','Helen','Benjamin','Samantha','Samuel','Katherine','Raymond','Christine','Gregory','Debra','Frank','Rachel','Alexander','Carolyn','Patrick','Janet','Jack','Catherine','Dennis','Maria','Jerry','Heather','Tyler','Diane','Aaron','Ruth','Jose','Julie','Adam','Olivia','Nathan','Joyce','Henry','Virginia','Douglas','Victoria','Zachary','Kelly','Peter','Lauren','Kyle','Christina','Noah','Joan','Ethan','Evelyn','Jeremy','Judith','Walter','Megan','Christian','Andrea','Keith','Cheryl','Roger','Hannah','Terry','Jacqueline','Austin','Martha','Sean','Gloria','Gerald','Teresa','Carl','Ann','Harold','Sara','Dylan','Madison','Arthur','Frances','Lawrence','Kathryn','Jordan','Janice','Jesse','Jean','Bryan','Abigail','Billy','Alice','Bruce','Judy','Gabriel','Sophia','Joe','Grace','Logan','Denise','Albert','Amber','Willie','Doris','Alan','Marilyn','Juan','Danielle','Wayne','Beverly','Elijah','Isabella','Randy','Theresa','Roy','Diana','Russell','Natalie','Vincent','Brittany','Philip','Charlotte','Bobby','Marie','Johnny','Kayla','Brad','Alexis'],

  _LAST_NAMES: ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores','Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell','Carter','Roberts','Gomez','Phillips','Evans','Turner','Diaz','Parker','Cruz','Edwards','Collins','Reyes','Stewart','Morris','Morales','Murphy','Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper','Peterson','Bailey','Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson','Watson','Brooks','Chavez','Wood','James','Bennett','Gray','Mendoza','Ruiz','Hughes','Price','Alvarez','Castillo','Sanders','Patel','Myers','Long','Ross','Foster','Jimenez','Powell','Jenkins','Perry','Russell','Sullivan','Bell','Coleman','Butler','Henderson','Barnes','Gonzales','Fisher','Vasquez','Simmons','Graham','Murray','Ford','Castro'],

  _DOMAINS: ['mailinator.com'],

  _generators: {
    email: function() {
      const first = Generator._pick(Generator._FIRST_NAMES).toLowerCase();
      const last = Generator._pick(Generator._LAST_NAMES).toLowerCase();
      const sep = Generator._pick(['.', '_', '']);
      const num = Math.random() > 0.5 ? Math.floor(Math.random() * 99) : '';
      return `${first}${sep}${last}${num}@mailinator.com`;
    },
    first: function() { return Generator._pick(Generator._FIRST_NAMES); },
    last: function() { return Generator._pick(Generator._LAST_NAMES); },
    full: function() { return Generator._pick(Generator._FIRST_NAMES) + ' ' + Generator._pick(Generator._LAST_NAMES); },
    uuid: function() { return crypto.randomUUID(); },
    cuid: function() {
      const ts = Date.now().toString(36);
      const rand = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(36)).join('');
      return `c${ts}${rand}`.slice(0, 25);
    }
  },

  init() {
    document.getElementById('gen-all').addEventListener('click', (e) => { e.stopPropagation(); this._generateAll(); });
    document.getElementById('gen-clear').addEventListener('click', (e) => { e.stopPropagation(); this._clearAll(); });

    document.querySelectorAll('.gen-card').forEach(card => {
      const type = card.dataset.type;

      card.addEventListener('click', () => {
        const value = card.querySelector('.gen-card-value').dataset.value;
        if (!value) return;
        navigator.clipboard.writeText(value);
        this._flashCopied(card);
      });

      card.querySelector('.gen-regen').addEventListener('click', (e) => {
        e.stopPropagation();
        this._generate(type);
      });

      const mailBtn = card.querySelector('.gen-mailinator');
      if (mailBtn) {
        mailBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = card.querySelector('.gen-card-value').dataset.value;
          if (!value) return;
          const local = value.split('@')[0];
          window.open(`https://www.mailinator.com/v4/public/inboxes.jsp?to=${local}`, '_blank');
        });
      }
    });

    this._generateAll();
  },

  _generate(type) {
    const card = document.querySelector(`.gen-card[data-type="${type}"]`);
    const valueEl = card.querySelector('.gen-card-value');
    const value = this._generators[type]();
    valueEl.textContent = value;
    valueEl.dataset.value = value;
    card.classList.add('has-value');
  },

  _generateAll() {
    for (const type of Object.keys(this._generators)) {
      this._generate(type);
    }
  },

  _flashCopied(card) {
    const valueEl = card.querySelector('.gen-card-value');
    const original = valueEl.textContent;
    valueEl.textContent = 'copied';
    valueEl.style.color = 'var(--accent)';
    setTimeout(() => {
      valueEl.textContent = original;
      valueEl.style.color = '';
    }, 600);
  },

  _clearAll() {
    document.querySelectorAll('.gen-card').forEach(card => {
      card.querySelector('.gen-card-value').textContent = '';
      card.querySelector('.gen-card-value').dataset.value = '';
      card.classList.remove('has-value');
    });
  },

  _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
};
