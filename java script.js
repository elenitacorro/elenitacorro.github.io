// JavaScript Document
function MiFuncion() {
       // aquí se define el ID del elemento que va a tomar la clase
     var x = document.getElementById("navegador");
     if (x.className === " ") {
         // esta es la clase que se agrega al elemento con eo id="navegador"
       x.className += "responsive";
     } else {
       x.className = " ";
     }
   }

window.addEventListener('scroll', function() {
        const header = document.querySelector('header');
        if (window.scrollY > 0) {
            header.classList.add('barrafija');
        } else {
            header.classList.remove('barrfafija');
        }
    });

function moveSlide(n) {
    currentSlide += n;
    if (currentSlide >= slides.length) currentSlide = 0;
    if (currentSlide < 0) currentSlide = slides.length - 1;
    showSlide(currentSlide);
}

let currentSlide = 0;
const slides = document.querySelector('.slides');
const totalSlides = document.querySelectorAll('.slide').length;

console.log('Total slides:', slides.length);

function showSlide(index) {
    if (index >= totalSlides) {
        currentSlide = 0;
    } else if (index < 0) {
        currentSlide = totalSlides - 1;
    } else {
        currentSlide = index;
    }

    // Cambia la posición de las diapositivas
    slides.style.transform = `translateX(-${currentSlide * 100}%)`;
}

function moveSlide(n) {
    showSlide(currentSlide + n);
}

// Muestra la primera diapositiva al cargar la página
showSlide(currentSlide);

    document.getElementById('contact-form').addEventListener('submit', function(event) {
        event.preventDefault(); // Evita que se recargue la página
        document.getElementById('thank-you-message').style.display = 'block'; // Muestra el mensaje de agradecimiento
        this.reset(); // Resetea el formulario
    });


</script>