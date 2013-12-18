/* global onMouseMove x:true y:true dx:true dy:true ctx d ballr paddleh paddlex paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 


/*************************************************
* @Author:Johnson                                *
* @Last-Update-Date: 11-15-2013                  *
* @Description: Added the fillStyle color to red *
* ************************************************/

//*********************************************
//Action: paddle
//*********************************************

    ctx.beginPath();  
    ctx.rect(x-30, y+10, paddlew+40, paddleh-15);
    ctx.closePath();
    ctx.fillStyle='red';
    ctx.fill();
    ctx.stroke();
 
 

/**********************************************
* @Author:Johnson                             *
* @Last-Update-Date: 21-05-2013               *
* @Description: Changed the arc function      *
* *********************************************/

//*********************************************
//Action: shape
//*********************************************

   ctx.beginPath();  
   ctx.arc(x, y, d, 1.8 * Math.PI/3, 1.4 * Math.PI, false);
   ctx.fillStyle='rgba(0, 0, 0, 1)';
   ctx.closePath();
   ctx.fill();
   ctx.stroke();
   
   

/*****************************************************
* @Author:Johnson                                    *
* @Last-Update-Date: 08-12-2013                      *
* @Description: Added the change for row calculation *
* ****************************************************/

//*********************************************
//Action: bounce
//*********************************************

   //collison detection
   var rowheight = BRICKHEIGHT + PADDING;
   var colwidth = BRICKWIDTH + PADDING;
   var row = Math.floor(y*rowheight);
   var col = Math.floor(x*colwidth);
  
  //reverse the ball and mark the brick as broken
  if (y < NROWS * rowheight && row >= 0 && col >= 0 && bricks[row][col] == 1) {
    dy = -dy*dx;
    bricks[row][col] = 10;
  }