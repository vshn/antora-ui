;(function () {
  'use strict'

  var toggles = Array.prototype.slice.call(document.querySelectorAll('.navbar-burger, .navbar-search-toggle'))
  if (!toggles.length) return
  toggles.forEach(function (toggle) {
    toggle.addEventListener('click', toggleNavbarPanel.bind(toggle))
  })

  // Keep in sync with the 1024px breakpoint in src/css/header.css. CSS media queries cannot read a variable.
  // Above it the panels are hidden or always shown by CSS, so a stale is-active (and the page clip the menu
  // sets) would otherwise come back when the window narrows again.
  var desktop = window.matchMedia('(min-width: 1024px)')
  desktop.addEventListener('change', function (e) {
    if (e.matches) toggles.forEach(function (it) { setPanel(it, false) })
  })

  function toggleNavbarPanel (e) {
    e.stopPropagation() // trap event
    var open = !this.classList.contains('is-active')
    // opening one closes the other, so the two panels never stack
    toggles.forEach(function (it) {
      if (it !== this && it.classList.contains('is-active')) setPanel(it, false)
    }, this)
    setPanel(this, open)
    if (open && this.classList.contains('navbar-search-toggle')) {
      var input = document.getElementById(this.dataset.target).querySelector('input')
      if (input) input.focus()
    }
  }

  function setPanel (toggle, open) {
    var panel = document.getElementById(toggle.dataset.target)
    toggle.classList.toggle('is-active', open)
    toggle.setAttribute('aria-expanded', String(open))
    panel.classList.toggle('is-active', open)
    // only the menu clips the page; a search field must leave the results scrollable
    if (toggle.classList.contains('navbar-burger')) {
      document.documentElement.classList.toggle('is-clipped--navbar', open)
    }
    if (open && panel.classList.contains('navbar-menu')) {
      panel.style.maxHeight = ''
      var expectedMaxHeight = window.innerHeight - Math.round(panel.getBoundingClientRect().top)
      var actualMaxHeight = parseInt(window.getComputedStyle(panel).maxHeight, 10)
      if (actualMaxHeight !== expectedMaxHeight) panel.style.maxHeight = expectedMaxHeight + 'px'
    }
  }
})()
