/***************************
 * How to play menu *
 ***************************/
(function() {
  //  CSS File
  let cssFile = document.createElement('link');
  cssFile.rel = 'stylesheet';
  cssFile.type = 'text/css';
  cssFile.href = 'css/rules.css';
  document.getElementsByTagName('head')[0].appendChild(cssFile);

  let modal = document.getElementById('rules_modal');
  let prevBtn = document.getElementById('prevBtn');
  let nextBtn = document.getElementById('nextBtn');
  let tabs = document.getElementsByClassName("tab");
  const progress = document.getElementById('rules_progress');
  const stepNames = ['Get started', 'Collect and use Specials', 'Special reference'];
  let btn = document.getElementsByClassName("icon-help")[0];

  const closeButton = document.getElementsByClassName("close-rules")[0];

  // When the user clicks the button, open the modal 
  btn.onclick = function() {
      modal.style.display = "block";
  };

  closeButton.onclick = function() {
      modal.style.display = "none";
  };

  prevBtn.onclick = function() {
      nextPrev(-1);
  };

  nextBtn.onclick = function() {
      nextPrev(1);
  };

  // When the user clicks anywhere outside of the modal, close it
  window.onclick = function(event) {
      if (event.target == modal) {
          modal.style.display = "none";
      }
  };

  let currentTab = 0; // Current tab is set to be the first tab (0)
  showTab(currentTab); // Display the crurrent tab

  function showTab(n) {
    // This function will display the specified tab of the form...
    tabs[n].style.display = "block";
    tabs[n].scrollTop = 0;
    progress.textContent = `Step ${n + 1} of ${tabs.length} - ${stepNames[n]}`;
    //... and fix the Previous/Next buttons:
    if (n == 0) {
      prevBtn.style.display = "none";
    } else {
      prevBtn.style.display = "inline";
    }
    if (n == (tabs.length - 1)) {
      nextBtn.innerHTML = "I understand";
    } else {
      nextBtn.innerHTML = "Next";
    }
    //... and run a function that will display the correct step indicator:
    fixStepIndicator(n);
  }

  function nextPrev(n) {
    // This function will figure out which tab to display
  
    // Exit the function if any field in the current tab is invalid:
    //if (n == 1 && !validateForm()) return false;
    // Hide the current tab:
    tabs[currentTab].style.display = "none";
    // Increase or decrease the current tab by 1:
    currentTab = currentTab + n;
    // if you have reached the end of the form...
    if (currentTab >= tabs.length) {
      // ... the form gets submitted:
      currentTab = 0;
      showTab(currentTab);
      fixStepIndicator(currentTab);

      localStorage.setItem("rule-read", true);
      modal.style.display = "none";
      return;
    }
    // Otherwise, display the correct tab:
    showTab(currentTab);
  }

  function fixStepIndicator(n) {
    // This function removes the "active" class of all steps...
    let i, x = document.getElementsByClassName("step");
    for (i = 0; i < x.length; i++) {
      x[i].className = x[i].className.replace(" active", "");
    }
    //... and adds the "active" class on the current step:
    x[n].className += " active";
  }

  if (typeof(Storage) !== "undefined") {
      if (localStorage.getItem("rule-read") === null) {
        modal.style.display = "block";
        document.getElementsByClassName("rules-popup")[0].setAttribute("style","margin-top: 0;");
      }
      if (localStorage.getItem("toggle-sound") === "off") {
        document.getElementById("toggle_sound").checked = false;
      }
  } else {
      modal.style.display = "block";
  }

})();

function toggleSound(checkbox) {
  localStorage.setItem("toggle-sound", checkbox.checked ? "on" : "off");
}

/***************************
 * Controler settings menu *
 ***************************/
/**
 * Controller keys
 */
let KEY_BINDS = {
  moveLeft: 37,
  moveRight: 39,
  moveDown: 40,
  hardDrop: 32,
  rotRight: 38,
  rotLeft:  90,
  special1: 49,
  special2: 50,
  special3: 51,
  special4: 52,
  special5: 53
};

(function () {
  /**
   * Text that shows after key press
   */
  const key = {
    8: 'Backspace',
    9: 'Tab',
    13: 'Enter',
    16: 'Shift',
    17: 'Ctrl',
    18: 'Alt',
    19: 'Pause',
    20: 'Caps Lock',
    27: 'Esc',
    32: 'Space',
    33: 'PgUp',
    34: 'PgDn',
    35: 'End',
    36: 'Home',
    37: '←',
    38: '↑',
    39: '→',
    40: '↓',
    45: 'Insert',
    46: 'Delete',
    48: '0',
    49: '1',
    50: '2',
    51: '3',
    52: '4',
    53: '5',
    54: '6',
    55: '7',
    56: '8',
    57: '9',
    59: ';',
    61: '=',
    65: 'A',
    66: 'B',
    67: 'C',
    68: 'D',
    69: 'E',
    70: 'F',
    71: 'G',
    72: 'H',
    73: 'I',
    74: 'J',
    75: 'K',
    76: 'L',
    77: 'M',
    78: 'N',
    79: 'O',
    80: 'P',
    81: 'Q',
    82: 'R',
    83: 'S',
    84: 'T',
    85: 'U',
    86: 'V',
    87: 'W',
    88: 'X',
    89: 'Y',
    90: 'Z',
    96: '0kpad',
    97: '1kpad',
    98: '2kpad',
    99: '3kpad',
    100: '4kpad',
    101: '5kpad',
    102: '6kpad',
    103: '7kpad',
    104: '8kpad',
    105: '9kpad',
    106: '*',
    107: '+',
    109: '-',
    110: '.',
    111: '/',
    112: 'F1',
    113: 'F2',
    114: 'F3',
    115: 'F4',
    116: 'F5',
    117: 'F6',
    118: 'F7',
    119: 'F8',
    120: 'F9',
    121: 'F10',
    122: 'F11',
    123: 'F12',
    173: '-',
    187: '=',
    188: ',',
    190: '.',
    191: '/',
    192: '`',
    219: '[',
    220: '\\',
    221: ']',
    222: "'",
  };
  let eventListenersEnabled = false;
  let currCell;
  let tempKey;
  const controls = document.getElementById('controls');
  const controlCells = controls.getElementsByTagName('td');
  const controlerModal = document.getElementById('controler_settings');
  // When the user clicks the button, open the controler modal 
  document.getElementsByClassName("icon-keyboard")[0].onclick = function () {
    controlerModal.style.display = "block";
    if(!eventListenersEnabled){
      eventListenersEnabled = true;
      keyListeners();
    }
  };
  function closeControls() {
    controlerModal.style.display = "none";
    //  If we're already waiting for an input, then set last vale when closing modal.
    if (currCell) {
      KEY_BINDS[currCell.id] = tempKey;
      currCell.innerHTML = key[tempKey];
      currCell = 0;
    }
    // Save the handling settings when closing, and show them as they were stored (clamped).
    saveHandling();
  }

  const handlingInputs = { das: 'DAS', arr: 'ARR', dcd: 'DCD', sdf: 'SDF' };
  const ghostInput = document.getElementById('ghost_piece');
  const osRepeatInput = document.getElementById('os_repeat');
  const sdfUnit = document.getElementById('SDF_unit');

  // DAS, ARR and DCD do nothing while the operating system's key repeat moves the block.
  function showLive(settings) {
    sdfUnit.textContent = settings.sdf >= Handling.SDF_INFINITE ? '∞' : '×';
    for (const id of ['DAS', 'ARR', 'DCD']) {
      const row = document.getElementById(id).closest('tr');
      row.classList.toggle('disabled', settings.osRepeat);
      row.querySelectorAll('input, button').forEach(control => { control.disabled = settings.osRepeat; });
    }
  }

  function showHandling(settings) {
    for (const name in handlingInputs) {
      document.getElementById(handlingInputs[name]).value = settings[name];
    }
    ghostInput.checked = settings.ghost;
    osRepeatInput.checked = settings.osRepeat;
    showLive(settings);
  }

  function readHandling() {
    const changes = { ghost: ghostInput.checked, osRepeat: osRepeatInput.checked };
    for (const name in handlingInputs) {
      changes[name] = document.getElementById(handlingInputs[name]).value;
    }
    return changes;
  }

  function saveHandling() {
    showHandling(HANDLING.set(readHandling()));
  }

  // Apply while the dialog is open, without rewriting a field that is being typed in.
  controlerModal.querySelector('#DAS_ARR').addEventListener('input', () => {
    showLive(HANDLING.set(readHandling()));
  });
  controlerModal.querySelectorAll('#DAS_ARR .number-input button').forEach(button => {
    button.addEventListener('click', saveHandling);
  });
  controlerModal.querySelector('#DAS_ARR').addEventListener('change', saveHandling);
  showHandling(HANDLING.get());

  const bounceInput = document.getElementById('arena_bounce');
  bounceInput.checked = localStorage.getItem('arena-bounce') !== 'off';
  bounceInput.addEventListener('change', () => {
    localStorage.setItem('arena-bounce', bounceInput.checked ? 'on' : 'off');
  });

  controlerModal.querySelectorAll('.close-controls, .close-controler-modal button').forEach(button => {
    button.addEventListener('click', closeControls);
  });

  function keyListeners(){
    // Give controls an event listener.
    for (let i = 0, len = controlCells.length; i < len; i++) {
      controlCells[i].onclick = function () {
        // First check if we're already waiting for an input.
        if (currCell) {
          KEY_BINDS[currCell.id] = tempKey;
          currCell.innerHTML = key[tempKey];
        }

        tempKey = KEY_BINDS[this.id];
        this.innerHTML = 'Press key';
        currCell = this;
      };
    }
    // Listen for key input, if a control has been clicked on then change value.
    document.addEventListener('keyup',function (e) {
      console.log(e);
        if (currCell) {
          const keyCode = UTILS.keyCode(e);
          if (!keyCode) {
            currCell.textContent = 'Unsupported key; try another';
            return;
          }
          // Checks if key already in use, and unbinds it.
          for (let i in KEY_BINDS) {
            if (keyCode === KEY_BINDS[i]) {
              KEY_BINDS[i] = void 0;
              document.getElementById(i).innerHTML = KEY_BINDS[i];
            }
          }
          // Binds the key and saves the data.
          KEY_BINDS[currCell.id] = keyCode;
          currCell.textContent = key[keyCode] || e.key || e.code || String(keyCode);
          localStorage.setItem('KEY_BINDS', JSON.stringify(KEY_BINDS));
          currCell = 0;
        }
    },false);
  }

  if (localStorage['KEY_BINDS']) {
    KEY_BINDS = JSON.parse(localStorage.getItem('KEY_BINDS'));
    for (let i = 0, len = controlCells.length; i < len; i++) {
      controlCells[i].innerHTML = key[KEY_BINDS[controlCells[i].id]];
    }
  }

})();