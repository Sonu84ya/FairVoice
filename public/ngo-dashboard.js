
document.querySelectorAll(".sidebar li")
.forEach(item=>{


item.addEventListener("click",()=>{


document.querySelector(".active")
.classList.remove("active");


item.classList.add("active");


});


});





document.querySelectorAll("button")
.forEach(btn=>{


btn.addEventListener("click",()=>{


alert(
btn.innerText+" action triggered"
);


});


});